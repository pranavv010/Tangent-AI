document.addEventListener('DOMContentLoaded', () => {
    // Launch Overlay
    const overlay = document.getElementById('launch-overlay');
    setTimeout(() => {
        if (overlay) {
            overlay.classList.add('fade-out');
            document.body.classList.remove('pre-launch');
            document.body.classList.add('launched');
            setTimeout(() => overlay.remove(), 800);
        }
    }, 2000);

    // Navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    const homeCards = document.querySelectorAll('.home-card');
    const pages = document.querySelectorAll('.page-view');

    let hasGreeted = false;

    function navigateTo(targetId) {
        // Update sidebar active state
        navBtns.forEach(b => {
            if (b.dataset.target === targetId) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        // Set body data attribute to switch backgrounds dynamically
        document.body.setAttribute('data-current-page', targetId);

        // Update pages visibility
        pages.forEach(page => {
            if (page.id === targetId) {
                page.style.display = '';
                page.classList.add('active-page');
            } else {
                page.style.display = 'none';
                page.classList.remove('active-page');
            }
        });

        if (targetId === 'page-debugger' && !hasGreeted) {
            hasGreeted = true;
            if (typeof triggerDynamicGreeting === 'function') {
                triggerDynamicGreeting();
            }
        }
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.target));
    });

    homeCards.forEach(card => {
        card.addEventListener('click', () => navigateTo(card.dataset.target));
    });

    // ---------------------------------------------------------
    // 1. GENERATOR TAB (1-Shot Mode)
    // ---------------------------------------------------------
    const genForm = document.getElementById('generator-form');
    const genPromptInput = document.getElementById('gen-prompt-input');
    const genGenerateBtn = document.getElementById('gen-generate-btn');
    const genSendIcon = genGenerateBtn ? genGenerateBtn.querySelector('.send-icon') : null;
    const genLoader = genGenerateBtn ? genGenerateBtn.querySelector('.loader') : null;
    const genErrorMessage = document.getElementById('gen-error-message');
    const genUserMessageTarget = document.getElementById('gen-user-message-target');
    const genOutputSectionTarget = document.getElementById('gen-output-section-target');
    const genCodeOutput = document.getElementById('gen-code-output');
    const genCopyBtn = document.getElementById('gen-copy-btn');
    const genDownloadBtn = document.getElementById('gen-download-btn');
    const presets = document.querySelectorAll('.preset-btn');
    
    let genCurrentScript = '';

    // Handle preset buttons
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.getAttribute('data-preset');
            if (preset && genPromptInput) {
                genPromptInput.value = preset;
                genPromptInput.focus();
                // trigger auto resize
                genPromptInput.dispatchEvent(new Event('input'));
            }
        });
    });

    // Handle Custom Default Texture Dropdown
    const customDropdown = document.getElementById('custom-texture-dropdown');
    if (customDropdown && genPromptInput) {
        const selectedContainer = customDropdown.querySelector('.custom-dropdown-selected');
        const selectedText = customDropdown.querySelector('.selected-text');
        const options = customDropdown.querySelectorAll('.custom-option');

        // Toggle dropdown open/close
        selectedContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            customDropdown.classList.toggle('open');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            customDropdown.classList.remove('open');
        });

        // Handle option selection
        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = option.getAttribute('data-value');
                const text = option.textContent;

                selectedText.textContent = text;
                customDropdown.classList.remove('open');

                if (value) {
                    genPromptInput.value = value;
                    genPromptInput.focus();
                    // Trigger auto resize
                    genPromptInput.dispatchEvent(new Event('input'));
                }
            });
        });
    }

    if (genPromptInput) {
        genPromptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                genForm.requestSubmit();
            }
        });
    }

    if (genForm) {
        genForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const prompt = genPromptInput.value.trim();
            if (!prompt) return;

            // Render static user message
            if (genUserMessageTarget) {
                genUserMessageTarget.innerHTML = `<div class="chat-message user">${prompt}</div>`;
            }
            if (genOutputSectionTarget) {
                genOutputSectionTarget.style.display = 'none';
            }

            genPromptInput.value = '';
            genPromptInput.style.height = 'auto';

            setGenLoading(true);
            setGenError('');

            try {
                if (genOutputSectionTarget) genOutputSectionTarget.style.display = 'block';
                if (genCodeOutput) {
                    genCodeOutput.textContent = '';
                }
                
                genCurrentScript = await callBackendApi({ mode: 'generator', prompt }, genCodeOutput, null, false);
                
                if (genCopyBtn) genCopyBtn.disabled = false;
                if (genDownloadBtn) genDownloadBtn.disabled = false;

            } catch (error) {
                setGenError(error.message);
                if (genOutputSectionTarget) genOutputSectionTarget.style.display = 'none';
            } finally {
                setGenLoading(false);
            }
        });
    }

    if (genCopyBtn) attachCopyAction(genCopyBtn, () => genCurrentScript, setGenError);
    if (genDownloadBtn) attachDownloadAction(genDownloadBtn, () => genCurrentScript);

    function setGenLoading(isLoading) {
        if(genGenerateBtn) genGenerateBtn.disabled = isLoading;
        if(genPromptInput) genPromptInput.disabled = isLoading;
        presets.forEach(btn => btn.disabled = isLoading);
        if(genSendIcon) genSendIcon.style.display = isLoading ? 'none' : 'block';
        if(genLoader) genLoader.style.display = isLoading ? 'block' : 'none';
    }

    function setGenError(msg) {
        if(!genErrorMessage) return;
        genErrorMessage.textContent = msg;
        genErrorMessage.style.display = msg ? 'block' : 'none';
    }


    // ---------------------------------------------------------
    // 2. DEBUGGER TAB (Chatbot Mode)
    // ---------------------------------------------------------
    const debugForm = document.getElementById('debugger-form');
    const debugPromptInput = document.getElementById('debug-prompt-input');
    const debugGenerateBtn = document.getElementById('debug-generate-btn');
    const debugSendIcon = debugGenerateBtn ? debugGenerateBtn.querySelector('.send-icon') : null;
    const debugLoader = debugGenerateBtn ? debugGenerateBtn.querySelector('.loader') : null;
    const debugErrorMessage = document.getElementById('debug-error-message');
    const debugChatHistory = document.getElementById('debug-chat-history');
    const debugChatAnchor = document.getElementById('debug-chat-anchor');
    
    let debuggerHistory = [];

    async function triggerDynamicGreeting() {
        setDebugLoading(true);
        setDebugError('');
        scrollToDebugBottom();

        const aiBubble = document.createElement('div');
        aiBubble.className = 'chat-message assistant markdown-body';
        debugChatHistory.insertBefore(aiBubble, debugChatAnchor);

        try {
            const greetingPrompt = "Hello! Please introduce yourself shortly (1-2 sentences) as the Tangent AI Free Chat assistant, ready to help the user debug Blender Python scripts, procedural nodes, or answer any questions they have. Do not output any code.";
            
            debuggerHistory.push({ role: 'user', content: greetingPrompt });

            let responseContent = await callBackendApi({ mode: 'debugger', messages: debuggerHistory }, aiBubble, scrollToDebugBottom, true);
            debuggerHistory.push({ role: 'assistant', content: responseContent });
            
            scrollToDebugBottom();
        } catch (error) {
            setDebugError("Failed to load greeting. " + error.message);
            aiBubble.remove();
            debuggerHistory.pop();
        } finally {
            setDebugLoading(false);
        }
    }

    if (debugPromptInput) {
        debugPromptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                debugForm.requestSubmit();
            }
        });
    }

    if (debugForm) {
        debugForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const prompt = debugPromptInput.value.trim();
            if (!prompt) return;

            debuggerHistory.push({ role: 'user', content: prompt });

            const userBubble = document.createElement('div');
            userBubble.className = 'chat-message user';
            userBubble.textContent = prompt;
            debugChatHistory.insertBefore(userBubble, debugChatAnchor);

            debugPromptInput.value = '';
            debugPromptInput.style.height = 'auto';

            setDebugLoading(true);
            setDebugError('');
            scrollToDebugBottom();

            const aiBubble = document.createElement('div');
            aiBubble.className = 'chat-message assistant markdown-body';
            debugChatHistory.insertBefore(aiBubble, debugChatAnchor);

            let responseContent = '';
            try {
                responseContent = await callBackendApi({ mode: 'debugger', messages: debuggerHistory }, aiBubble, scrollToDebugBottom, true);
                debuggerHistory.push({ role: 'assistant', content: responseContent });
                
                // If the response contains a code block, append quick actions for it
                const codeMatch = responseContent.match(/```python([\s\S]*?)```/);
                if (codeMatch) {
                    const extractedScript = codeMatch[1].trim();
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'output-actions';
                    actionsDiv.style.marginTop = '10px';
                    actionsDiv.innerHTML = `
                        <button type="button" class="secondary-btn copy-btn">Copy Code</button>
                        <button type="button" class="secondary-btn download-btn">Download .py</button>
                    `;
                    aiBubble.appendChild(actionsDiv);
                    
                    const copyBtn = actionsDiv.querySelector('.copy-btn');
                    const downloadBtn = actionsDiv.querySelector('.download-btn');
                    attachCopyAction(copyBtn, () => extractedScript, setDebugError);
                    attachDownloadAction(downloadBtn, () => extractedScript);
                }
                
                scrollToDebugBottom();
            } catch (error) {
                setDebugError(error.message);
                aiBubble.remove();
                debuggerHistory.pop(); // Remove failed user message from memory to prevent broken state
            } finally {
                setDebugLoading(false);
            }
        });
    }

    function setDebugLoading(isLoading) {
        if(debugGenerateBtn) debugGenerateBtn.disabled = isLoading;
        if(debugPromptInput) debugPromptInput.disabled = isLoading;
        if(debugSendIcon) debugSendIcon.style.display = isLoading ? 'none' : 'block';
        if(debugLoader) debugLoader.style.display = isLoading ? 'block' : 'none';
    }

    function setDebugError(msg) {
        if(!debugErrorMessage) return;
        debugErrorMessage.textContent = msg;
        debugErrorMessage.style.display = msg ? 'block' : 'none';
    }

    function scrollToDebugBottom() {
        if (debugChatAnchor) {
            debugChatAnchor.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // ---------------------------------------------------------
    // Shared Utilities
    // ---------------------------------------------------------
    function attachCopyAction(btn, getScriptFn, setErrorFn) {
        btn.addEventListener('click', async () => {
            const script = getScriptFn();
            if (!script) return;
            try {
                await navigator.clipboard.writeText(script);
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = originalText, 2000);
            } catch (err) {
                if(setErrorFn) setErrorFn('Failed to copy to clipboard.');
            }
        });
    }

    function attachDownloadAction(btn, getScriptFn) {
        btn.addEventListener('click', () => {
            const script = getScriptFn();
            if (!script) return;
            const blob = new Blob([script], { type: 'text/x-python' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'tnob_material.py';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    async function callBackendApi(payload, textElement, onProgress = null, isMarkdown = false) {
        try {
            let apiUrl = (window.ENV && window.ENV.API_URL !== undefined) ? window.ENV.API_URL : 'http://localhost:5000';
            // Automatically use relative path if deployed (not localhost and not file://)
            if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:') {
                apiUrl = '';
            }
            const endpoint = apiUrl ? `${apiUrl}/api/generate` : '/api/generate';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let content = "";
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                content += decoder.decode(value, { stream: true });
                if (textElement) {
                    if (isMarkdown && window.marked) {
                        textElement.innerHTML = marked.parse(content);
                    } else {
                        textElement.textContent = content;
                    }
                }
                if (onProgress) onProgress();
            }
            
            if (!isMarkdown) {
                if (content.startsWith("```python")) content = content.substring(9);
                if (content.startsWith("```")) content = content.substring(3);
                if (content.endsWith("```")) content = content.substring(0, content.length - 3);
            }
            content = content.trim();
            
            if (textElement) {
                if (isMarkdown && window.marked) {
                    // Do not overwrite with raw text if we are rendering markdown
                } else {
                    textElement.textContent = content;
                }
            }
            return content;
            
        } catch (error) {
            console.error("Error calling backend:", error);
            throw new Error(error.message || 'Failed to connect to the backend server.');
        }
    }

    // Ripple Effect Mouse Tracking
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.addEventListener('mousemove', (e) => {
            const rect = mainContent.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            mainContent.style.setProperty('--mx', `${x}px`);
            mainContent.style.setProperty('--my', `${y}px`);
        });
    }

    // Sidebar Toggle Logic
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });

        // Close sidebar when clicking outside of it
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== sidebarToggle) {
                sidebar.classList.remove('open');
            }
        });

        // Close sidebar when a navigation link is clicked (optional but good UX)
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                sidebar.classList.remove('open');
            });
        });
    }
});
