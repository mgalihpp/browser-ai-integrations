/**
 * SSE Stream Parser for Chrome Extension
 * Handles raw text tokens from backend SSE stream.
 *
 * Usage:
 * const response = await fetch('/agent/run', { method: 'POST', ... });
 * for await (const event of readSSEStream(response)) {
 *   if (event.type === 'data') {
 *     console.log(event.value);
 *   }
 * }
 */
async function* readSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent = 'data';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode(); // Final flush
        break;
      }

      // Decode the chunk and add it to our buffer
      // TextDecoder with {stream: true} correctly handles multibyte character splitting
      buffer += decoder.decode(value, { stream: true });

      // Split the buffer by double newlines to get potential SSE blocks
      // However, we need to process line by line to handle 'event:' fields
      const lines = buffer.split(/\r?\n/);

      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          let dataValue = line.slice(5);
          // Standard SSE: data: <optional space><content>
          if (dataValue.startsWith(' ')) {
            dataValue = dataValue.slice(1);
          }

          if (dataValue.trim() === '[DONE]') {
            yield { type: 'done', value: '' };
            return;
          }

          if (currentEvent === 'error') {
            yield { type: 'error', value: dataValue };
          } else {
            yield { type: 'data', value: dataValue };
          }
        }
      }
    }

    // Flush remaining buffer if it looks like a complete line
    if (buffer.trim()) {
      if (buffer.startsWith('data:')) {
        let dataValue = buffer.slice(5);
        if (dataValue.startsWith(' ')) {
          dataValue = dataValue.slice(1);
        }

        if (dataValue.trim() === '[DONE]') {
          yield { type: 'done', value: '' };
        } else if (currentEvent === 'error') {
          yield { type: 'error', value: dataValue };
        } else {
          yield { type: 'data', value: dataValue };
        }
      }
    }
  } catch (error) {
    yield { type: 'error', value: error.message || 'Stream connection lost' };
  } finally {
    reader.releaseLock();
  }
}

// Expose to window global for non-module extension environment
window.readSSEStream = readSSEStream;
