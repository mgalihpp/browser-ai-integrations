// Side Panel script for Browser AI Assistant

// Simple Markdown parser
function parseMarkdown(text) {
  if (!text) return '';
  
  let html = text;
  
  // Escape HTML first
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Code blocks (```language\ncode```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });
  
  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  
  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  
  // Unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  // Paragraphs - wrap remaining text blocks
  html = html.replace(/^(?!<[a-z])(.*[^\n])$/gm, '<p>$1</p>');
  
  // Clean up empty paragraphs and fix nesting
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr>)<\/p>/g, '$1');
  
  // Line breaks for remaining newlines
  html = html.replace(/\n/g, '');
  
  return html;
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const chatContainer = document.getElementById('chat-container');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const pageTitle = document.getElementById('page-title');
  const refreshBtn = document.getElementById('refresh-context');
  const themeToggle = document.getElementById('theme-toggle');
  const themeIconLight = document.getElementById('theme-icon-light');
  const themeIconDark = document.getElementById('theme-icon-dark');

  let isProcessing = false;

  // Theme management
  function getTheme() {
    return localStorage.getItem('ai-assistant-theme') || 'dark';
  }
  
  function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('ai-assistant-theme', theme);
    
    if (theme === 'dark') {
      themeIconLight.style.display = 'none';
      themeIconDark.style.display = 'block';
    } else {
      themeIconLight.style.display = 'block';
      themeIconDark.style.display = 'none';
    }
  }
  
  function toggleTheme() {
    const current = getTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
  }
  
  // Initialize theme
  setTheme(getTheme());
  
  themeToggle.addEventListener('click', toggleTheme);

  // Update connection status
  function updateStatus(connected) {
    if (connected) {
      statusDot.classList.add('connected');
      statusText.textContent = 'Terhubung';
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = 'Terputus';
    }
  }

  // Update page context display
  function updatePageInfo(title, url) {
    console.log('[Sidepanel] Updating page info:', title);
    if (title && pageTitle) {
      pageTitle.textContent = title;
      pageTitle.title = url || '';
    } else if (pageTitle) {
      pageTitle.textContent = 'Tidak ada halaman terdeteksi';
    }
  }

  // Add message to chat
  function addMessage(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'bubble';
    
    if (isUser) {
      bubbleDiv.textContent = text;
    } else {
      bubbleDiv.innerHTML = parseMarkdown(text);
    }
    
    messageDiv.appendChild(bubbleDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return messageDiv;
  }

  // Show typing indicator
  function showTyping() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant typing';
    messageDiv.id = 'typing-indicator';
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'bubble';
    bubbleDiv.textContent = 'Berpikir';
    
    messageDiv.appendChild(bubbleDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Remove typing indicator
  function hideTyping() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
  }

  // Send message to backend
  async function sendMessage(messageText = null) {
    const message = messageText || messageInput.value.trim();
    if (!message || isProcessing) return;
    
    isProcessing = true;
    
    // Add user message to chat
    addMessage(message, true);
    messageInput.value = '';
    sendBtn.disabled = true;
    
    showTyping();
    
    try {
      // Capture fresh context RIGHT BEFORE sending the message
      // This ensures we get the current scroll position/view
      console.log('[Sidepanel] Capturing fresh context before sending...');
      await chrome.runtime.sendMessage({ action: 'forceContextUpdate' });
      
      // Small delay to ensure context is updated on backend
      await new Promise(r => setTimeout(r, 200));
      
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });
      
      hideTyping();
      
      if (!response.ok) {
        throw new Error('Failed to get response');
      }
      
      const data = await response.json();
      addMessage(data.response || 'Tidak ada respons');
      updateStatus(true);
    } catch (error) {
      hideTyping();
      console.error('Error sending message:', error);
      addMessage('**Error:** Tidak bisa terhubung ke backend. Pastikan server berjalan di `localhost:3000`');
      updateStatus(false);
    } finally {
      sendBtn.disabled = false;
      isProcessing = false;
      messageInput.focus();
    }
  }

  // Get and display current tab info
  async function refreshTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('[Sidepanel] Current tab:', tab?.title);
      if (tab && tab.title) {
        updatePageInfo(tab.title, tab.url);
      }
    } catch (e) {
      console.error('[Sidepanel] Error getting tab info:', e);
    }
  }

  // Check backend connection and get current tab info
  async function initialize() {
    console.log('[Sidepanel] Initializing...');
    
    // Check backend health
    try {
      const response = await fetch('http://localhost:3000/health');
      updateStatus(response.ok);
    } catch {
      updateStatus(false);
    }
    
    // Get current tab info
    await refreshTabInfo();
  }

  // Event listeners
  sendBtn.addEventListener('click', () => sendMessage());

  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Quick action buttons
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt) {
        sendMessage(prompt);
      }
    });
  });

  // Refresh context button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('spinning');
      
      try {
        // Tell background to force update context
        await chrome.runtime.sendMessage({ action: 'forceContextUpdate' });
        
        // Update page title display
        await refreshTabInfo();
        
        // Brief delay to show the update happened
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.error('Error refreshing context:', e);
      }
      
      refreshBtn.classList.remove('spinning');
    });
  }

  // Listen for tab changes
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log('[Sidepanel] Tab activated:', activeInfo.tabId);
    await refreshTabInfo();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.title) {
      chrome.tabs.query({ active: true, currentWindow: true }, async ([activeTab]) => {
        if (activeTab && activeTab.id === tabId) {
          console.log('[Sidepanel] Tab updated:', tab.title);
          updatePageInfo(tab.title, tab.url);
        }
      });
    }
  });

  // Initialize
  initialize();
  messageInput.focus();
});
