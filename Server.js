const net = require("net");

// ========================
// PARSER HTTP MVP
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
  // 1️⃣ Start-line
  const lineEnd = buffer.indexOf("\r\n");
  if (lineEnd === -1) return { status: "INCOMPLETE" };

  // 2️⃣ Headers
  const headersEnd = buffer.indexOf("\r\n\r\n");
  if (headersEnd === -1) return { status: "INCOMPLETE" };

  const head = buffer.slice(0, headersEnd);
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
  const contentLength = headers["content-length"]
    ? parseInt(headers["content-length"], 10)
    : 0;

  if (isNaN(contentLength) || contentLength < 0) return { status: "ERROR" };
  if (buffer.length < bodyStart + contentLength) return { status: "INCOMPLETE" };

  const body = buffer.slice(bodyStart, bodyStart + contentLength);
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
  const body = `Hello from raw HTTP server!
Method: ${req.method}
Path: ${req.path}`;

  socket.write(
    `HTTP/1.1 200 OK\r\n` +
    `Content-Length: ${body.length}\r\n` +
    `Connection: close\r\n` +
    `\r\n` +
    body
  );

  socket.end();
}

// ========================
// ERROS HTTP
// ========================
function sendError(socket, code) {
  const messages = { 400: "Bad Request", 408: "Request Timeout" };
  const body = messages[code] || "Error";

  socket.write(
    `HTTP/1.1 ${code} ${body}\r\n` +
    `Content-Length: ${body.length}\r\n` +
    `Connection: close\r\n` +
    `\r\n` +
    body
  );
}

// ========================
// SERVIDOR TCP HTTP
// ========================
const server = net.createServer(socket => {
  let buffer = "";
  socket.setTimeout (10000);

  socket.on("timeout", () => {
    sendError(socket, 408);
    socket.end();
  });
  
  socket.on("data", chunk => {

    socket.setTimeout(5000);
    
    
    buffer += chunk.toString();

    if (buffer.length > 1e6) {
        sendError(socket, 413);
        socket.end();
        return;
      }

    while (true) {
      const result = tryParseRequest(buffer);

      if (result.status === "INCOMPLETE") return;
      if (result.status === "ERROR") {
        sendError(socket, 400);
        socket.end();
        return;
      }

      

      if (result.status === "OK") {
        handleRequest(socket, result.request);
        buffer = result.remaining;
        if (!buffer.length) return;
      }
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
