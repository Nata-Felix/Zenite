// Serviços locais de teste: tráfego HTTP real, sem contas ou dados externos.
const { createServer } = require('node:http');
module.exports = async function fixture() {
  const calls = [];
  const server = createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    const text = Buffer.concat(parts).toString();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    calls.push({ method: req.method, url: req.url, body, auth: req.headers.authorization });
    const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    if (req.url.startsWith('/api/redirect')) { res.writeHead(302, { Location: '/api/other' }); return res.end(); }
    if (req.url.startsWith('/api/large')) return res.end('x'.repeat(1_000_001));
    if (req.url.startsWith('/api/fail')) { res.statusCode = 503; return json({ error: 'Indisponível' }); }
    if (req.url.startsWith('/api')) return json({ message: 'Serviço local conectado', method: req.method, body, auth: req.headers.authorization ?? null });
    if (req.url === '/mcp') {
      if (req.method === 'DELETE') { res.statusCode = 204; return res.end(); }
      const reply = result => json({ jsonrpc: '2.0', id: body.id, result });
      if (body.method === 'initialize') { res.setHeader('Mcp-Session-Id', 'qa-session'); return reply({ protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'qa-local', version: '1' } }); }
      if (req.headers['mcp-session-id'] !== 'qa-session' || req.headers['mcp-protocol-version'] !== '2025-11-25') { res.statusCode = 400; return res.end(); }
      if (body.method === 'notifications/initialized') { res.statusCode = 202; return res.end(); }
      if (body.method === 'tools/list') {
        if (body.params?.cursor === 'page2') return reply({ tools: [{ name: 'status', description: 'Estado local', inputSchema: { type: 'object' } }] });
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(': keepalive\n\nevent: message\ndata: {"jsonrpc":"2.0","method":"notifications/message","params":{}}\n\n');
        res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'echo', description: 'Devolve os dados recebidos', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } }], nextCursor: 'page2' } })}\n\n`);
        // Mantém SSE aberto: o cliente precisa parar ao encontrar a resposta do seu pedido.
        return;
      }
      if (body.method === 'tools/call') return reply({ content: [{ type: 'text', text: `Ferramenta executada: ${JSON.stringify(body.params.arguments)}` }], isError: false });
      return json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Método desconhecido' } });
    }
    res.statusCode = 404; res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); } };
};
