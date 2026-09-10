import struct
import math

# GLB file format generator for a detailed low-poly hospital
class GLBGenerator:
    def __init__(self):
        self.vertices = []
        self.indices = []
        self.normals = []
        self.uvs = []
        self.vertex_offset = 0
        
    def add_quad(self, p1, p2, p3, p4, normal, uv_coords=None):
        """Add a quad (two triangles) to the mesh"""
        start = self.vertex_offset
        
        # Add vertices
        for p in [p1, p2, p3, p4]:
            self.vertices.extend(p)
            self.normals.extend(normal)
            if uv_coords:
                self.uvs.extend(uv_coords[len(self.uvs)//2 % 4])
            else:
                self.uvs.extend([0, 0])
        
        # Add indices for two triangles
        self.indices.extend([start, start+1, start+2])
        self.indices.extend([start, start+2, start+3])
        
        self.vertex_offset += 4
    
    def add_box(self, x, y, z, width, height, depth):
        """Add a box to the mesh"""
        x2, y2, z2 = x + width, y + height, z + depth
        
        # Front
        self.add_quad([x, y, z2], [x2, y, z2], [x2, y2, z2], [x, y2, z2], [0, 0, 1])
        # Back
        self.add_quad([x2, y, z], [x, y, z], [x, y2, z], [x2, y2, z], [0, 0, -1])
        # Left
        self.add_quad([x, y, z], [x, y, z2], [x, y2, z2], [x, y2, z], [-1, 0, 0])
        # Right
        self.add_quad([x2, y, z2], [x2, y, z], [x2, y2, z], [x2, y2, z2], [1, 0, 0])
        # Top
        self.add_quad([x, y2, z2], [x2, y2, z2], [x2, y2, z], [x, y2, z], [0, 1, 0])
        # Bottom
        self.add_quad([x, y, z], [x2, y, z], [x2, y, z2], [x, y, z2], [0, -1, 0])
    
    def add_floor(self, x, y, z, width, depth, thickness=0.2):
        """Add a floor plane"""
        self.add_box(x, y, z, width, thickness, depth)
    
    def add_wall(self, x, y, z, width, height, thickness=0.2):
        """Add a wall"""
        self.add_box(x, y, z, width, height, thickness)
    
    def add_door(self, x, y, z, width=2, height=3, depth=0.1):
        """Add a door frame"""
        self.add_box(x, y, z, width, height, depth)
    
    def add_window(self, x, y, z, width=1.5, height=1.5, depth=0.1):
        """Add a window"""
        self.add_box(x, y, z, width, height, depth)
    
    def add_bush(self, x, y, z, size=1.5):
        """Add a low-poly bush (sphere-like)"""
        # Simple octahedron for bush
        top = [x, y + size, z]
        bottom = [x, y, z]
        front = [x, y + size/2, z + size/2]
        back = [x, y + size/2, z - size/2]
        left = [x - size/2, y + size/2, z]
        right = [x + size/2, y + size/2, z]
        
        # Create triangular faces
        faces = [
            (top, front, right), (top, right, back), (top, back, left), (top, left, front),
            (bottom, right, front), (bottom, back, right), (bottom, left, back), (bottom, front, left)
        ]
        
        for face in faces:
            # Calculate normal
            v1 = [face[1][i] - face[0][i] for i in range(3)]
            v2 = [face[2][i] - face[0][i] for i in range(3)]
            normal = [
                v1[1]*v2[2] - v1[2]*v2[1],
                v1[2]*v2[0] - v1[0]*v2[2],
                v1[0]*v2[1] - v1[1]*v2[0]
            ]
            length = math.sqrt(sum(n*n for n in normal))
            if length > 0:
                normal = [n/length for n in normal]
            else:
                normal = [0, 1, 0]
            
            start = self.vertex_offset
            for p in face:
                self.vertices.extend(p)
                self.normals.extend(normal)
                self.uvs.extend([0, 0])
            self.indices.extend([start, start+1, start+2])
            self.vertex_offset += 3
    
    def build_hospital(self):
        """Build the complete hospital structure"""
        floor_height = 4.5
        wall_thickness = 0.3
        
        # Ground floor foundation
        self.add_floor(-30, 0, -30, 60, 60, 0.5)
        
        # MAIN BUILDING - 4 stories
        building_width = 40
        building_depth = 30
        building_x = -20
        building_z = -15
        
        for floor in range(4):
            floor_y = floor * floor_height
            
            # Exterior walls
            # Front wall
            self.add_wall(building_x, floor_y, building_z + building_depth, building_width, floor_height, wall_thickness)
            # Back wall
            self.add_wall(building_x, floor_y, building_z, building_width, floor_height, wall_thickness)
            # Left wall
            self.add_wall(building_x, floor_y, building_z, wall_thickness, floor_height, building_depth)
            # Right wall
            self.add_wall(building_x + building_width, floor_y, building_z, wall_thickness, floor_height, building_depth)
            
            # Floor
            self.add_floor(building_x, floor_y + floor_height - 0.2, building_z, building_width, building_depth, 0.2)
            
            # Interior corridors and rooms
            corridor_width = 3
            
            # Central corridor walls
            corridor_z = building_z + building_depth/2 - corridor_width/2
            
            # Left side rooms
            room_width = 6
            room_depth = 8
            num_rooms = 3
            
            for i in range(num_rooms):
                room_x = building_x + 2 + i * (room_width + wall_thickness)
                room_z = building_z + 2
                
                # Room walls
                if room_x + room_width < building_x + building_width - 2:
                    # Front wall with door
                    self.add_wall(room_x, floor_y, room_z + room_depth, room_width * 0.3, floor_height, wall_thickness)
                    self.add_wall(room_x + room_width * 0.7, floor_y, room_z + room_depth, room_width * 0.3, floor_height, wall_thickness)
                    # Door
                    self.add_door(room_x + room_width * 0.35, floor_y, room_z + room_depth, 2, 3, 0.1)
                    
                    # Side walls
                    self.add_wall(room_x, floor_y, room_z, wall_thickness, floor_height, room_depth)
                    self.add_wall(room_x + room_width, floor_y, room_z, wall_thickness, floor_height, room_depth)
                    
                    # Back wall with window
                    self.add_wall(room_x, floor_y, room_z, room_width * 0.3, floor_height, wall_thickness)
                    self.add_wall(room_x + room_width * 0.7, floor_y, room_z, room_width * 0.3, floor_height, wall_thickness)
                    self.add_window(room_x + room_width * 0.35, floor_y + floor_height * 0.4, room_z - 0.1, 1.8, 1.5, 0.2)
                    
                    # If ground floor, first room is doctor's examination room
                    if floor == 0 and i == 0:
                        # Examination table
                        self.add_box(room_x + 1.5, floor_y + 0.2, room_z + 3, 2, 0.8, 4)
                        # Doctor's desk
                        self.add_box(room_x + room_width - 2.5, floor_y + 0.2, room_z + 1, 2, 0.9, 1.2)
                        # Chair
                        self.add_box(room_x + room_width - 2, floor_y + 0.2, room_z + 2.5, 0.8, 0.5, 0.8)
            
            # Right side rooms (mirror)
            for i in range(num_rooms):
                room_x = building_x + 2 + i * (room_width + wall_thickness)
                room_z = building_z + building_depth - room_depth - 2
                
                if room_x + room_width < building_x + building_width - 2:
                    # Front wall with door
                    self.add_wall(room_x, floor_y, room_z, room_width * 0.3, floor_height, wall_thickness)
                    self.add_wall(room_x + room_width * 0.7, floor_y, room_z, room_width * 0.3, floor_height, wall_thickness)
                    self.add_door(room_x + room_width * 0.35, floor_y, room_z, 2, 3, 0.1)
                    
                    # Side walls
                    self.add_wall(room_x, floor_y, room_z, wall_thickness, floor_height, room_depth)
                    self.add_wall(room_x + room_width, floor_y, room_z, wall_thickness, floor_height, room_depth)
                    
                    # Back wall with window
                    self.add_wall(room_x, floor_y, room_z + room_depth, room_width * 0.3, floor_height, wall_thickness)
                    self.add_wall(room_x + room_width * 0.7, floor_y, room_z + room_depth, room_width * 0.3, floor_height, wall_thickness)
                    self.add_window(room_x + room_width * 0.35, floor_y + floor_height * 0.4, room_z + room_depth, 1.8, 1.5, 0.2)
            
            # Stairwell at the end
            stair_x = building_x + building_width - 8
            stair_z = building_z + building_depth/2 - 3
            
            # Stairwell walls
            self.add_wall(stair_x, floor_y, stair_z, wall_thickness, floor_height, 6)
            self.add_wall(stair_x + 6, floor_y, stair_z, wall_thickness, floor_height, 6)
            self.add_wall(stair_x, floor_y, stair_z, 6, floor_height, wall_thickness)
            self.add_wall(stair_x, floor_y, stair_z + 6, 6, floor_height, wall_thickness)
            
            # Stairs (simple boxes)
            num_steps = 12
            step_height = floor_height / num_steps
            step_depth = 0.5
            for step in range(num_steps):
                self.add_box(stair_x + 1, floor_y + step * step_height, 
                           stair_z + 1 + step * step_depth, 4, step_height * 0.2, step_depth)
        
        # Roof
        self.add_floor(building_x, 4 * floor_height, building_z, building_width, building_depth, 0.5)
        
        # Roof edge/parapet
        parapet_height = 1
        self.add_wall(building_x, 4 * floor_height + 0.5, building_z + building_depth, building_width, parapet_height, wall_thickness)
        self.add_wall(building_x, 4 * floor_height + 0.5, building_z, building_width, parapet_height, wall_thickness)
        self.add_wall(building_x, 4 * floor_height + 0.5, building_z, wall_thickness, parapet_height, building_depth)
        self.add_wall(building_x + building_width, 4 * floor_height + 0.5, building_z, wall_thickness, parapet_height, building_depth)
        
        # PARKING LOT
        parking_x = building_x - 35
        parking_z = building_z
        parking_width = 30
        parking_depth = 30
        
        # Parking ground
        self.add_floor(parking_x, 0, parking_z, parking_width, parking_depth, 0.1)
        
        # Parking space markings (raised white lines)
        num_spaces = 10
        space_width = parking_width / 2
        space_depth = parking_depth / num_spaces
        
        for i in range(num_spaces + 1):
            line_z = parking_z + i * space_depth
            # Horizontal lines
            self.add_box(parking_x, 0.1, line_z, parking_width, 0.05, 0.1)
        
        # Vertical divider
        self.add_box(parking_x + parking_width/2, 0.1, parking_z, 0.1, 0.05, parking_depth)
        
        # BUSHES BORDER AROUND PARKING
        bush_spacing = 3
        
        # Front border
        for i in range(int(parking_width / bush_spacing)):
            self.add_bush(parking_x + i * bush_spacing + 1, 0, parking_z + parking_depth + 2, 1.2)
        
        # Back border
        for i in range(int(parking_width / bush_spacing)):
            self.add_bush(parking_x + i * bush_spacing + 1, 0, parking_z - 2, 1.2)
        
        # Left border
        for i in range(int(parking_depth / bush_spacing)):
            self.add_bush(parking_x - 2, 0, parking_z + i * bush_spacing + 1, 1.2)
        
        # Right border (between parking and building)
        for i in range(int(parking_depth / bush_spacing)):
            self.add_bush(parking_x + parking_width + 2, 0, parking_z + i * bush_spacing + 1, 1.2)
        
        # ENTRANCE AREA
        entrance_x = building_x + building_width/2 - 4
        entrance_z = building_z + building_depth
        
        # Entrance canopy
        self.add_box(entrance_x, floor_height * 0.8, entrance_z, 8, 0.3, 5)
        # Canopy supports
        self.add_box(entrance_x + 1, 0, entrance_z + 1, 0.4, floor_height * 0.8, 0.4)
        self.add_box(entrance_x + 6.6, 0, entrance_z + 1, 0.4, floor_height * 0.8, 0.4)
        
        # Front entrance door (double doors)
        door_x = building_x + building_width/2 - 2
        self.add_door(door_x, 0, entrance_z - 0.3, 4, 3.5, 0.2)
        
        # SIGNAGE (HOSPITAL cross)
        sign_x = building_x + building_width/2 - 2
        sign_y = 4 * floor_height + parapet_height
        sign_z = building_z + building_depth + 0.5
        
        # Vertical part of cross
        self.add_box(sign_x + 1.5, sign_y, sign_z, 1, 4, 0.3)
        # Horizontal part of cross
        self.add_box(sign_x + 0.5, sign_y + 1.5, sign_z, 3, 1, 0.3)
        
        # LANDSCAPING BUSHES around building
        bush_positions = [
            (building_x - 3, 0, building_z + 5),
            (building_x - 3, 0, building_z + 10),
            (building_x - 3, 0, building_z + 15),
            (building_x - 3, 0, building_z + 20),
            (building_x - 3, 0, building_z + 25),
            (building_x + building_width + 2, 0, building_z + 5),
            (building_x + building_width + 2, 0, building_z + 10),
            (building_x + building_width + 2, 0, building_z + 15),
        ]
        
        for pos in bush_positions:
            self.add_bush(pos[0], pos[1], pos[2], 1.5)
    
    def to_glb(self, filename):
        """Export to GLB format"""
        # Convert lists to bytes
        vertices_bytes = struct.pack(f'{len(self.vertices)}f', *self.vertices)
        normals_bytes = struct.pack(f'{len(self.normals)}f', *self.normals)
        uvs_bytes = struct.pack(f'{len(self.uvs)}f', *self.uvs)
        indices_bytes = struct.pack(f'{len(self.indices)}H', *self.indices)
        
        # Calculate buffer sizes
        vertex_buffer_size = len(vertices_bytes)
        normal_buffer_size = len(normals_bytes)
        uv_buffer_size = len(uvs_bytes)
        index_buffer_size = len(indices_bytes)
        
        # Align to 4-byte boundaries
        def align_4(size):
            return (size + 3) & ~3
        
        vertex_buffer_size_aligned = align_4(vertex_buffer_size)
        normal_buffer_size_aligned = align_4(normal_buffer_size)
        uv_buffer_size_aligned = align_4(uv_buffer_size)
        index_buffer_size_aligned = align_4(index_buffer_size)
        
        # Pad buffers
        vertices_bytes += b'\x00' * (vertex_buffer_size_aligned - vertex_buffer_size)
        normals_bytes += b'\x00' * (normal_buffer_size_aligned - normal_buffer_size)
        uvs_bytes += b'\x00' * (uv_buffer_size_aligned - uv_buffer_size)
        indices_bytes += b'\x00' * (index_buffer_size_aligned - index_buffer_size)
        
        # Combine all buffers
        buffer_data = vertices_bytes + normals_bytes + uvs_bytes + indices_bytes
        buffer_length = len(buffer_data)
        
        # Calculate min/max for vertices
        min_vals = [float('inf'), float('inf'), float('inf')]
        max_vals = [float('-inf'), float('-inf'), float('-inf')]
        for i in range(0, len(self.vertices), 3):
            for j in range(3):
                min_vals[j] = min(min_vals[j], self.vertices[i + j])
                max_vals[j] = max(max_vals[j], self.vertices[i + j])
        
        # Create JSON structure
        gltf = {
            "asset": {"version": "2.0", "generator": "Hospital GLB Generator"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0}],
            "meshes": [{
                "primitives": [{
                    "attributes": {
                        "POSITION": 0,
                        "NORMAL": 1,
                        "TEXCOORD_0": 2
                    },
                    "indices": 3,
                    "mode": 4
                }]
            }],
            "accessors": [
                {
                    "bufferView": 0,
                    "componentType": 5126,
                    "count": len(self.vertices) // 3,
                    "type": "VEC3",
                    "min": min_vals,
                    "max": max_vals
                },
                {
                    "bufferView": 1,
                    "componentType": 5126,
                    "count": len(self.normals) // 3,
                    "type": "VEC3"
                },
                {
                    "bufferView": 2,
                    "componentType": 5126,
                    "count": len(self.uvs) // 2,
                    "type": "VEC2"
                },
                {
                    "bufferView": 3,
                    "componentType": 5123,
                    "count": len(self.indices),
                    "type": "SCALAR"
                }
            ],
            "bufferViews": [
                {"buffer": 0, "byteOffset": 0, "byteLength": vertex_buffer_size_aligned, "target": 34962},
                {"buffer": 0, "byteOffset": vertex_buffer_size_aligned, "byteLength": normal_buffer_size_aligned, "target": 34962},
                {"buffer": 0, "byteOffset": vertex_buffer_size_aligned + normal_buffer_size_aligned, "byteLength": uv_buffer_size_aligned, "target": 34962},
                {"buffer": 0, "byteOffset": vertex_buffer_size_aligned + normal_buffer_size_aligned + uv_buffer_size_aligned, "byteLength": index_buffer_size_aligned, "target": 34963}
            ],
            "buffers": [{"byteLength": buffer_length}]
        }
        
        import json
        json_str = json.dumps(gltf, separators=(',', ':'))
        json_bytes = json_str.encode('utf-8')
        json_length = len(json_bytes)
        json_padding = (4 - (json_length % 4)) % 4
        json_bytes += b' ' * json_padding
        json_length_padded = len(json_bytes)
        
        # GLB structure
        # Header: magic, version, length
        # Chunk 0: JSON
        # Chunk 1: Binary buffer
        
        total_length = 12 + 8 + json_length_padded + 8 + buffer_length
        
        with open(filename, 'wb') as f:
            # GLB header
            f.write(struct.pack('<I', 0x46546C67))  # magic 'glTF'
            f.write(struct.pack('<I', 2))  # version
            f.write(struct.pack('<I', total_length))
            
            # JSON chunk
            f.write(struct.pack('<I', json_length_padded))
            f.write(struct.pack('<I', 0x4E4F534A))  # 'JSON'
            f.write(json_bytes)
            
            # Binary chunk
            f.write(struct.pack('<I', buffer_length))
            f.write(struct.pack('<I', 0x004E4942))  # 'BIN\0'
            f.write(buffer_data)

# Generate the hospital
gen = GLBGenerator()
gen.build_hospital()
gen.to_glb(r'C:\Users\rudra\Desktop\BrowOS\assets\models\gta\buildings\hospital.glb')
print("Hospital GLB model generated successfully!")
print(f"Total vertices: {len(gen.vertices) // 3}")
print(f"Total triangles: {len(gen.indices) // 3}")
