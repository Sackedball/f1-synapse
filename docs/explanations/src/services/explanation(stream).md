# Explanation: stream.py

## High-Level Overview
`src/services/stream.py` implements the inter-process communication (IPC) messaging backbone of the project. It provides an asynchronous TCP publisher-subscriber network running on `localhost:9999`.

The primary 2D race replay window runs the `TelemetryStreamServer`, broadcasting high-frequency JSON-encoded telemetry frames to any number of decoupled client processes. Secondary analysis windows (such as Driver Telemetry, Tyre Strategy, Lap Time Charts, Track Position, and ML Predictions) run `TelemetryStreamClient` on background Qt threads to receive live data without impacting OpenGL rendering performance.

---

## Dependencies

### Standard Library
- `socket`: TCP socket creation, binding, listening, and non-blocking streaming.
- `json`: Serializes outgoing dictionaries to JSON lines (`\n`) and deserializes incoming stream chunks.
- `threading`: Manages background connection listeners and thread-safe client list synchronization (`threading.Lock`).
- `time`: Delays and keepalive pacing.

### External Libraries
- `PySide6.QtCore.QThread, Signal`: Implements Qt event loop threading, allowing asynchronous network I/O to safely emit Qt signals (`data_received`, `connection_status`, `error_occurred`) to the main GUI thread.

---

## Classes & Functions

### `TelemetryStreamServer`
Hosted by the 2D race replay window to publish live frames.

- **Attributes**:
  - `host` (*str*): Server address (default: `'localhost'`).
  - `port` (*int*): Server port (default: `9999`).
  - `clients` (*list*): Active TCP socket connections.
  - `clients_lock` (*threading.Lock*): Mutex protecting concurrent client registration and broadcast removal.
  - `running` (*bool*): Server lifecycle flag.
- **Methods**:
  - **`start()`**: Creates non-blocking TCP socket, binds to port, and launches `accept_clients` daemon thread.
  - **`accept_clients()`**: Continuously accepts incoming client connections, appends them to `self.clients`, and spawns a per-client keepalive thread.
  - **`handle_client(client_socket)`**: Maintains connection alive and cleans up dead sockets on disconnection.
  - **`broadcast(data)`**: Serializes `data` dictionary to UTF-8 encoded JSON terminated by `\n`. Iterates across connected clients, sends the payload, and removes dead/disconnected clients.
  - **`stop()`**: Shuts down server socket, closes all active client sockets, and resets connection pool.

### `TelemetryStreamClient(QThread)`
Hosted by PySide6 Pit Wall insight windows to consume telemetry frames.

- **Signals**:
  - `data_received(dict)`: Emits deserialized telemetry payload to UI widgets.
  - `connection_status(str)`: Emits status changes (`"Connecting..."`, `"Connected"`, `"Disconnected"`).
  - `error_occurred(str)`: Emits diagnostic error messages.
- **Methods**:
  - **`run()`**: QThread entry loop. Continuously attempts connection and data reception, sleeping 2 seconds before retry on disconnect.
  - **`_connect_to_server()`**: Opens TCP socket with 5.0s timeout to connect to server.
  - **`_receive_data()`**: Reads data in 4KB chunks, buffers incoming stream fragments, splits complete messages on `\n`, decodes JSON, and emits `data_received(data)`.
  - **`stop()`**: Terminates thread loop and closes socket.
