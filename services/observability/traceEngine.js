class TraceEngine {

  constructor() {
    this.traces = [];
  }

  trace(type, payload) {

    const trace = {
      id: Date.now() + Math.random(),
      type,
      payload,
      ts: Date.now()
    };

    this.traces.push(trace);

    return trace;

  }

  all() {
    return this.traces;
  }

}

module.exports = new TraceEngine();
