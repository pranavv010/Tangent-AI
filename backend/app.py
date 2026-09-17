import os
import json
import requests
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
CORS(app, resources={r"/api/*": {"origins": cors_origins}})

with open(os.path.join(os.path.dirname(__file__), "blender_api_ref.txt"), "r") as f:
    BLENDER_API_REF = f.read()

with open(os.path.join(os.path.dirname(__file__), "texture.md"), "r") as f:
    TEXTURE_LIBRARY = f.read()

TEXTURES_DICT = {}
_curr_name = None
_curr_lines = []
for line in TEXTURE_LIBRARY.split('\n'):
    if line.startswith("TEXTURE: "):
        if _curr_name:
            TEXTURES_DICT[_curr_name] = "\n".join(_curr_lines).strip()
        _curr_name = line.replace("TEXTURE: ", "").strip().lower()
        _curr_lines = []
    elif _curr_name:
        _curr_lines.append(line)
if _curr_name:
    TEXTURES_DICT[_curr_name] = "\n".join(_curr_lines).strip()

GENERATOR_SYSTEM_PROMPT = f"""You are an expert Blender 4.x/5.x Python (bpy) developer specialized in procedural materials.
Your task is to translate natural language descriptions into optimized Blender Python shader node scripts.

Follow these strict rules:
1. ONLY return valid Python code. Do NOT wrap the code in markdown blocks (no ```python ... ```). Do NOT include any explanations or conversational text.
2. The script must create a new material, enable nodes, and clear existing nodes.
3. You MUST utilize `nodes.new(type="...")` syntax.
4. You MUST enforce updated Blender 4.x/5.x BSDF socket names (e.g., "Base Color", "Roughness", "Metallic", "IOR", "Subsurface Weight").
5. `ShaderNodeMusgraveTexture` is REMOVED in Blender 4.x/5.x! Do NOT use it. Use `ShaderNodeTexNoise` instead for organic noise.
6. The `ShaderNodeBsdfPrincipled` node has only ONE output named "BSDF". Do NOT use "Subsurface BSDF" as it does not exist.
7. DO NOT set `.default_value` on node OUTPUT sockets. Only set `.default_value` on INPUT sockets.
8. When setting `.default_value` for 3D Vectors (like Mapping or Object Info), you MUST provide exactly 3 items: `(x, y, z)`. For colors, use 4 items: `(r, g, b, a)`.
9. Automatically offset node coordinates (`node.location = (x, y)`) so the graph is organized.
10. The graph MUST include a `ShaderNodeOutputMaterial` and a `ShaderNodeBsdfPrincipled`.
11. NEVER import unauthorized modules like os, sys, subprocess, requests, socket. ONLY use `bpy` and `math`.
12. CRITICAL: NEVER assign values directly to node object attributes! (e.g., `node.scale = 2.0` is FATAL and will crash). You MUST assign values ONLY to input sockets via `.inputs["Socket Name"].default_value` (e.g., `node.inputs["Scale"].default_value = 2.0`).
13. You have access to a library of pre-defined texture scripts. If the user input directly matches a texture in the library, THAT CODE DOES NOT NEED TO BE ALTERED AT ALL; output its script exactly as it is. Unless the user specifies anything more (like changing a color), ONLY THEN should you use your intelligence to edit/alter the given code from this library to fulfill the request.
14. INTERPRET THE DESIRED TEXTURE INTELLIGENTLY. You must provide the absolute best, cleanest, most optimized procedural code with zero errors.

{BLENDER_API_REF}

PRE-DEFINED TEXTURE LIBRARY:
{TEXTURE_LIBRARY}

Example template:
import bpy

def create_material():
    mat = bpy.data.materials.new(name="TNOB_Generated_Material")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    # Material Output
    output = nodes.new(type="ShaderNodeOutputMaterial")
    output.location = (400, 0)
    
    # Principled BSDF
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    
    links.new(bsdf.outputs[0], output.inputs[0])

create_material()
"""

DEBUGGER_SYSTEM_PROMPT = f"""You are a highly intelligent, conversational AI assistant specialized in debugging Blender 4.x/5.x Python (bpy) shader node scripts.
Your task is to help the user diagnose errors, explain concepts casually, and fix their procedural materials.

Follow these strict rules:
1. Be conversational and helpful. Explain issues clearly.
2. ONLY generate the full, corrected Python script if the user explicitly asks for it, or if it is the clear next step to fixing their error.
3. When you DO provide code, you MUST wrap it in standard markdown blocks (```python ... ```).
4. You MUST enforce updated Blender 4.x/5.x BSDF socket names (e.g., "Base Color", "Roughness", "Metallic", "IOR", "Subsurface Weight").
5. `ShaderNodeMusgraveTexture` is REMOVED in Blender 4.x/5.x! Do NOT use it. Use `ShaderNodeTexNoise` instead for organic noise.
6. The `ShaderNodeBsdfPrincipled` node has only ONE output named "BSDF".
7. DO NOT set `.default_value` on node OUTPUT sockets. Only set `.default_value` on INPUT sockets.
8. When setting `.default_value` for 3D Vectors (like Mapping or Object Info), you MUST provide exactly 3 items: `(x, y, z)`. For colors, use 4 items: `(r, g, b, a)`.
9. NEVER import unauthorized modules like os, sys, subprocess, requests, socket. ONLY use `bpy` and `math`.
10. CRITICAL: NEVER assign values directly to node object attributes! (e.g., `node.scale = 2.0` is FATAL and will crash). You MUST assign values ONLY to input sockets via `.inputs["Socket Name"].default_value` (e.g., `node.inputs["Scale"].default_value = 2.0`).
11. You have access to a library of pre-defined texture scripts. Refer to them if the user asks about a texture in the library, or use them as a basis to fix/modify custom textures.

{BLENDER_API_REF}

PRE-DEFINED TEXTURE LIBRARY:
{TEXTURE_LIBRARY}
"""

@app.route('/api/generate', methods=['POST'])
def generate():
    data = request.json
    if not data:
        return jsonify({"error": "Request body is required"}), 400
        
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        return jsonify({"error": "NVIDIA_API_KEY is not set"}), 500

    mode = data.get('mode', 'generator')
    current_system_prompt = DEBUGGER_SYSTEM_PROMPT if mode == 'debugger' else GENERATOR_SYSTEM_PROMPT
    enable_thinking = False

    prompt = ""
    if 'messages' in data and isinstance(data['messages'], list) and len(data['messages']) > 0:
        prompt = data['messages'][-1].get('content', '')
    elif 'prompt' in data:
        prompt = data.get('prompt', '')
        
    prompt_lower = prompt.strip().lower()
    
    if mode == 'generator' and prompt_lower in TEXTURES_DICT:
        return Response(TEXTURES_DICT[prompt_lower], mimetype='text/plain')

    # Handle incoming chat history
    if 'messages' in data and isinstance(data['messages'], list):
        api_messages = [{"role": "system", "content": current_system_prompt}] + data['messages']
    elif 'prompt' in data:
        # Fallback for old single prompt interface
        api_messages = [
            {"role": "system", "content": current_system_prompt},
            {"role": "user", "content": data['prompt']}
        ]
    else:
        return jsonify({"error": "Prompt or messages array is required"}), 400

    try:
        client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=api_key
        )
        
        completion = client.chat.completions.create(
            model="nvidia/nemotron-3.5-lightning-30b-a3b",
            messages=api_messages,
            temperature=0.2,
            top_p=0.95,
            max_tokens=16384,
            extra_body={"chat_template_kwargs": {"enable_thinking": enable_thinking}, "reasoning_budget": 16384},
            stream=True
        )
        
        def stream_generator():
            reasoning_started = False
            reasoning_ended = False
            for chunk in completion:
                if not chunk.choices:
                    continue
                
                reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
                if reasoning:
                    if not reasoning_started:
                        if mode == 'debugger':
                            yield "> **Thinking...**\n> "
                        reasoning_started = True
                        
                    if mode == 'debugger':
                        yield reasoning.replace('\n', '\n> ')

                content = getattr(chunk.choices[0].delta, "content", None)
                if content is not None:
                    if reasoning_started and not reasoning_ended:
                        if mode == 'debugger':
                            yield "\n\n"
                        reasoning_ended = True
                    yield content

        return Response(stream_generator(), mimetype='text/plain')
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error calling NVIDIA API: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    debug_mode = os.environ.get("FLASK_DEBUG", "False").lower() in ("true", "1", "t")
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
