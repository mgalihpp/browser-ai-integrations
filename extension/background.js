// Background service worker for Browser AI Assistant

const BACKEND_WS_URL = 'ws://localhost:3000/ws';
const CONTEXT_UPDATE_INTERVAL = 5000; // 5 seconds

let ws = null;
let contextInterval = null;
let isConnected = false;
let lastTabId = null;
let lastUrl = null;

// Setup side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[Background] Side panel error:', error));

// Initialize WebSocket connection
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }
  
  try {
    ws = new WebSocket(BACKEND_WS_URL);
    
    ws.onopen = () => {
      console.log('[Background] WebSocket connected');
      isConnected = true;
      startContextUpdates();
    };
    
    ws.onclose = () => {
      console.log('[Background] WebSocket disconnected');
      isConnected = false;
      stopContextUpdates();
      // Attempt reconnection after 5 seconds
      setTimeout(connectWebSocket, 5000);
    };
    
    ws.onerror = (error) => {
      console.error('[Background] WebSocket error:', error);
    };
    
    ws.onmessage = (event) => {
      console.log('[Background] Message received:', event.data);
    };
  } catch (error) {
    console.error('[Background] Failed to connect WebSocket:', error);
    setTimeout(connectWebSocket, 5000);
  }
}

// Start periodic context updates
function startContextUpdates() {
  if (contextInterval) return;
  
  contextInterval = setInterval(captureAndSendContext, CONTEXT_UPDATE_INTERVAL);
  // Send initial context
  captureAndSendContext();
}

// Stop context updates
function stopContextUpdates() {
  if (contextInterval) {
    clearInterval(contextInterval);
    contextInterval = null;
  }
}

// Capture current tab context and send to backend
async function captureAndSendContext(forceUpdate = false) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    
    // Skip if same tab and URL (unless forced)
    if (!forceUpdate && tab.id === lastTabId && tab.url === lastUrl) {
      console.log('[Background] Same tab/URL, skipping update');
      return;
    }
    
    lastTabId = tab.id;
    lastUrl = tab.url;
    
    // Get page content from content script
    let pageContent = null;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getContext' });
      pageContent = response;
    } catch (e) {
      console.log('[Background] Could not get content from tab:', e.message);
      // Try to inject content script if not present
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // Retry after injection
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getContext' });
        pageContent = response;
      } catch (injectError) {
        console.log('[Background] Could not inject content script:', injectError.message);
      }
    }
    
    // Capture viewport screenshot
    let screenshot = null;
    try {
      screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 50 });
    } catch (e) {
      console.log('[Background] Could not capture screenshot:', e.message);
    }
    
    // Build context object
    const context = {
      type: 'context_update',
      timestamp: new Date().toISOString(),
      url: tab.url,
      title: tab.title,
      content: pageContent ? pageContent.text : null,
      screenshot: screenshot,
    };
    
    // Apply client-side privacy filter
    const sanitizedContext = sanitizeContext(context);
    
    // Send to backend
    ws.send(JSON.stringify(sanitizedContext));
    console.log('[Background] Context sent:', sanitizedContext.url, 'Content length:', sanitizedContext.content?.length || 0);
  } catch (error) {
    console.error('[Background] Error capturing context:', error);
  }
}

// Client-side privacy filter
function sanitizeContext(context) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const creditCardRegex = /\b(?:\d[ -]*?){13,16}\b/g;
  const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
  
  const sanitize = (text) => {
    if (!text) return text;
    return text
      .replace(emailRegex, '[EMAIL_REDACTED]')
      .replace(creditCardRegex, '[CC_REDACTED]')
      .replace(phoneRegex, '[PHONE_REDACTED]');
  };
  
  return {
    ...context,
    content: sanitize(context.content),
    title: sanitize(context.title),
  };
}

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('[Background] Tab activated:', activeInfo.tabId);
  // Force immediate context update when switching tabs
  setTimeout(() => captureAndSendContext(true), 100);
});

// Listen for tab URL changes (navigation within tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    console.log('[Background] Tab updated:', tab.url);
    // Force immediate context update when page loads
    setTimeout(() => captureAndSendContext(true), 500);
  }
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    console.log('[Background] Window focused:', windowId);
    setTimeout(() => captureAndSendContext(true), 100);
  }
});

// Listen for messages from popup/sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getConnectionStatus') {
    sendResponse({ connected: isConnected });
  } else if (message.action === 'forceContextUpdate') {
    // Allow manual trigger from UI
    captureAndSendContext(true);
    sendResponse({ success: true });
  }
  return true;
});

// Initialize connection when service worker starts
connectWebSocket();

console.log('[Background] Browser AI Assistant service worker started');
