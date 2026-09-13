/** Client-side reader for the existing SSE route contracts. */
export async function streamPost(url, body, onEvent) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Could not complete the request (${response.status}). Please try again.`);
  if (!response.body) throw new Error('The connection ended before Sous could respond. Please try again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = (frame) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    let event;
    try { event = JSON.parse(data); } catch { return; }
    onEvent(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop();
      frames.forEach(dispatch);
      if (done) { if (buffer.trim()) dispatch(buffer); break; }
    }
  } finally { reader.releaseLock(); }
}
