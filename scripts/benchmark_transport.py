import json
import gzip
import struct

def run_benchmark():
    # Per driver channels:
    # x(f32), y(f32), dist(f32), speed(f32), throttle(f32), brake(f32), gapAhead(f32), gapLeader(f32) -> 8 * 4 = 32 bytes
    # gear(i8), drs(u8), tyre(u8), tyreLife(u8), position(u8), inPit(u8), status(u8) -> 7 * 1 = 7 bytes
    # lap(i16) -> 2 bytes
    # total per driver = 41 bytes
    
    # Global channels:
    # trackStatus(u8), scPhase(u8) -> 2 bytes
    # scX(f32), scY(f32) -> 8 bytes
    # total global = 10 bytes
    
    drivers_count = 20
    bytes_per_frame = (drivers_count * 41) + 10
    
    header = {
        "v": 1, "i0": 0, "n": 1500, "fps": 25,
        "drivers": [f"DRV{i}" for i in range(drivers_count)],
        "perDriver": [
            {"name":"x","dtype":"f32"}, {"name":"y","dtype":"f32"},
            {"name":"dist","dtype":"f32"}, {"name":"speed","dtype":"f32"},
            {"name":"throttle","dtype":"f32"}, {"name":"brake","dtype":"f32"},
            {"name":"gapAhead","dtype":"f32"}, {"name":"gapLeader","dtype":"f32"},
            {"name":"gear","dtype":"i8"}, {"name":"drs","dtype":"u8"},
            {"name":"tyre","dtype":"u8"}, {"name":"tyreLife","dtype":"u8"},
            {"name":"position","dtype":"u8"}, {"name":"inPit","dtype":"u8"},
            {"name":"status","dtype":"u8"}, {"name":"lap","dtype":"i16"}
        ],
        "global": [
            {"name":"trackStatus","dtype":"u8"}, {"name":"scX","dtype":"f32"},
            {"name":"scY","dtype":"f32"}, {"name":"scPhase","dtype":"u8"}
        ]
    }
    
    header_json = json.dumps(header).encode('utf-8')
    header_len = len(header_json)
    
    sizes = [750, 1500, 3000]
    
    print("Transport Benchmark (Binary Format v1)")
    print("-" * 50)
    for n_frames in sizes:
        # Dummy data block
        data_block = b'\x00' * (bytes_per_frame * n_frames)
        
        # Build uncompressed chunk
        # Magic (4) + headerLen (4) + header + data
        uncompressed = b'F1SC' + struct.pack('<I', header_len) + header_json + data_block
        
        # Compress
        compressed = gzip.compress(uncompressed)
        
        print(f"Chunk size: {n_frames} frames ({(n_frames/25):.1f} sec)")
        print(f"  Uncompressed : {len(uncompressed) / 1024:.2f} KB")
        # For an accurate compressed estimate of real data, we can't use all zeros as it compresses too well.
        # Let's estimate compression ratio of float binary data is roughly 40-50% if there is noise,
        # but 0s compress to almost 0 bytes. So we'll skip compressed size from this script,
        # or we'll just generate random bytes for the data block.
        import random
        random_block = bytes([random.randint(0, 255) for _ in range(len(data_block))])
        uncompressed_rand = b'F1SC' + struct.pack('<I', header_len) + header_json + random_block
        compressed_rand = gzip.compress(uncompressed_rand)
        print(f"  Compressed (worst-case random): {len(compressed_rand) / 1024:.2f} KB")
        print(f"  Theoretical throughput at 10 requests/sec: {(len(compressed_rand) * 10) / 1024 / 1024:.2f} MB/s")
        print("-" * 50)

if __name__ == "__main__":
    run_benchmark()
