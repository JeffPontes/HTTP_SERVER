const net = require("net");

// ========================
// PARSER HTTP MVP (bytes-friendly)
// ========================
class HttpRequest {
  constructor() {
    this.method = "";
    this.path = "";
    this.version = "";
    this.headers = {};
    this.body = null;
  }
}

function tryParseRequest(buffer) {
  // Convertemos apenas o necessário para string
  const str = buffer.toString("utf8");

  // 1️⃣ Start-line
  const lineEnd = str.indexOf("\r\n");
  if (lineEnd === -1) return { status: "INCOMPLETE" };

  // 2️⃣ Headers
  const headersEnd = str.indexOf("\r\n\r\n");
  if (headersEnd === -1) return { status: "INCOMPLETE" };

  const head = str.slice(0, headersEnd);
  const lines = head.split("\r\n");

  const [method, path, version] = lines[0].split(" ");
  if (!method || !path || !version) return { status: "ERROR" };

  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(":");
    if (idx === -1) return { status: "ERROR" };
    const key = lines[i].slice(0, idx).toLowerCase();
    const value = lines[i].slice(idx + 1).trim();
    headers[key] = value;
  }

  // 3️⃣ Body
  const bodyStart = headersEnd + 4;
  const contentLength = headers["content-length"] ? parseInt(headers["content-length"], 10) : 0;

  if (isNaN(contentLength) || contentLength < 0) return { status: "ERROR" };
  if (buffer.length < bodyStart + contentLength) return { status: "INCOMPLETE" };

  const body = buffer.slice(bodyStart, bodyStart + contentLength); // pega bytes puros
  const remaining = buffer.slice(bodyStart + contentLength);

  return {
    status: "OK",
    request: { method, path, version, headers, body },
    remaining
  };
}

// ========================
// HANDLER DE REQUEST
// ========================
function handleRequest(socket, req) {
  // Se o body for JSON, podemos parsear
  let bodyContent = "";
  if (req.headers["content-type"] === "application/json" && req.body.length) {
    try { bodyContent = JSON.parse(req.body.toString("utf8")); } 
    catch(e) { bodyContent = "Invalid JSON"; console.log("Failed to parse JSON body"); }
  }

  const responseBody = `Hello from raw HTTP server!
Method: ${req.method}
Path: ${req.path}
Body: ${bodyContent ? JSON.stringify(bodyContent) : "No Body"}`;

  socket.write(
    `HTTP/1.1 200 OK\r\n` +
    `Content-Length: ${Buffer.byteLength(responseBody)}\r\n` +
    `Connection: close\r\n` +
    `\r\n` +
    responseBody
  );

  socket.end();
}

// ========================
// ERROS HTTP
// ========================
function sendError(socket, code) {
  const messages = { 400: "Bad Request", 408: "Request Timeout", 413: "Payload Too Large" };
  const body = messages[code] || "Error";

  socket.write(
    `HTTP/1.1 ${code} ${body}\r\n` +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    `Connection: close\r\n` +
    `\r\n` +
    body
  );
  console.log('Bad request, sent', code);
  socket.end();
}

// ========================
// SERVIDOR TCP HTTP
// ========================
const server = net.createServer(socket => {
  console.log("New connection established", socket.remoteAddress, socket.remotePort);
  let buffer = Buffer.alloc(0); // acumulador de bytes
  socket.setTimeout(10000);

  socket.on("timeout", () => sendError(socket, 408));

  socket.on("data", chunk => {
    socket.setTimeout(5000); // reset timeout a cada chunk
    buffer = Buffer.concat([buffer, chunk]); // acumula bytes
    console.log(`[DATA] chunk: ${chunk.length} bytes, buffer: ${buffer.length} bytes`);

    if (buffer.length > 1e6) return sendError(socket, 413); // limite de 1MB

    while (true) {
      const result = tryParseRequest(buffer);

      if (result.status === "INCOMPLETE") break;
      if (result.status === "ERROR") return sendError(socket, 400);

      handleRequest(socket, result.request);
      buffer = result.remaining;

      if (buffer.length === 0) break; // tudo processado
    }
  });

  socket.on("error", () => socket.destroy());
});

// ========================
// START SERVER
// ========================
server.listen(8080, () => {
  console.log("HTTP MVP server listening on port 8080");
});
