const { EventEmitter } = require('events');

class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // OPEN
    this.peer = null;
  }

  accept() {
    // Cloudflare Workers WebSocket.accept()
  }

  send(data) {
    if (this.peer && this.peer.readyState === 1) {
      process.nextTick(() => {
        this.peer.emit('message', { data });
        if (typeof this.peer.onmessage === 'function') {
          this.peer.onmessage({ data });
        }
      });
    }
  }

  close(code = 1000, reason = '') {
    this.readyState = 3; // CLOSED
    if (this.peer && this.peer.readyState !== 3) {
      this.peer.readyState = 3;
      process.nextTick(() => {
        this.peer.emit('close', { code, reason });
        if (typeof this.peer.onclose === 'function') {
          this.peer.onclose({ code, reason });
        }
      });
    }
    this.emit('close', { code, reason });
    if (typeof this.onclose === 'function') {
      this.onclose({ code, reason });
    }
  }

  addEventListener(event, listener) {
    this.on(event, listener);
  }

  removeEventListener(event, listener) {
    this.off(event, listener);
  }
}

function createMockWebSocketPair() {
  const client = new MockWebSocket();
  const server = new MockWebSocket();
  client.peer = server;
  server.peer = client;
  return { 0: client, 1: server, client, server };
}

// Attach WebSocketPair to globalThis for worker environment
globalThis.WebSocketPair = function () {
  return createMockWebSocketPair();
};

class MockDurableObjectNamespace {
  constructor(DurableObjectClass, env) {
    this.DurableObjectClass = DurableObjectClass;
    this.env = env;
    this.instances = new Map();
  }

  idFromName(name) {
    return { name, toString: () => `do-${name}` };
  }

  get(id) {
    const key = id.toString();
    if (!this.instances.has(key)) {
      const mockState = {
        id,
        storage: new Map(),
      };
      const instance = new this.DurableObjectClass(mockState, this.env);
      this.instances.set(key, instance);
    }
    const instance = this.instances.get(key);

    return {
      instance,
      async fetch(request) {
        return instance.fetch(request);
      },
      handleWebSocketSession(ws) {
        return instance.handleWebSocketSession(ws);
      },
    };
  }
}

module.exports = {
  MockWebSocket,
  createMockWebSocketPair,
  MockDurableObjectNamespace,
};
