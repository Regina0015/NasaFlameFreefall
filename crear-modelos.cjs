const fs = require("node:fs");
const path = require("node:path");

const output = path.join(__dirname, "dashboard", "public", "models");
fs.mkdirSync(output, { recursive: true });

const palette = [
  { name: "Blue-gray alloy", color: [0.61, 0.68, 0.76, 1] },
  { name: "Structural graphite", color: [0.23, 0.31, 0.40, 1] },
  { name: "Solar cells", color: [0.06, 0.12, 0.21, 1] },
  { name: "Cyan light", color: [0.32, 0.85, 0.93, 1] },
  { name: "Champagne detail", color: [0.76, 0.65, 0.43, 1] },
];

const objects = [];

function part(name, vertices, triangles, material) {
  objects.push({ name, vertices, triangles, material });
}

function box(name, center, size, material) {
  const vertices = [
    [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
    [-1,-1,1], [1,-1,1], [1,1,1], [-1,1,1],
  ].map(p => p.map((v, i) => center[i] + v * size[i] / 2));

  part(name, vertices, [
    [0,2,1], [0,3,2], [4,5,6], [4,6,7],
    [0,1,5], [0,5,4], [3,7,6], [3,6,2],
    [0,4,7], [0,7,3], [1,2,6], [1,6,5],
  ], material);
}

function cylinder(name, center, radius, length, material, axis = "x") {
  const count = 24;
  const vertices = [];
  const triangles = [];

  function orient(x, y, z) {
    const p = axis === "x" ? [z, x, y]
      : axis === "z" ? [x, y, z] : [x, z, -y];
    return p.map((v, i) => v + center[i]);
  }

  for (let end = 0; end < 2; end++) {
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      vertices.push(orient(
        Math.cos(a) * radius,
        Math.sin(a) * radius,
        (end - 0.5) * length
      ));
    }
  }

  vertices.push(orient(0, 0, -length / 2));
  vertices.push(orient(0, 0, length / 2));

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    triangles.push([i, j, j + count], [i, j + count, i + count]);
    triangles.push([count * 2, j, i]);
    triangles.push([count * 2 + 1, i + count, j + count]);
  }

  part(name, vertices, triangles, material);
}

// Main habitat modules.
[-4, -1.35, 1.35, 4].forEach((x, i) => {
  cylinder(`Habitat-${i + 1}`, [x, 0, 0], 0.72, 2.25, 0);

  [-1.02, -0.88, 0.88, 1.02].forEach((dx, j) => {
    cylinder(`Collar-${i}-${j}`, [x + dx, 0, 0], 0.76, 0.07, 1);
  });

  [-0.76, 0.76].forEach((dx, j) => {
    cylinder(`Cyan-ring-${i}-${j}`, [x + dx, 0, 0], 0.765, 0.035, 3);
  });

  for (let j = 0; j < 5; j++) {
    box(`Hull-panel-${i}-${j}`, [x - 0.76 + j * 0.38, 0.12, 0.72],
      [0.25, 0.38, 0.045], 1);
  }

  cylinder(`Connector-${i}`, [x + 1.3, 0, 0], 0.43, 0.4, 1);
});

// Docking ports.
[-1, 1].forEach(side => {
  cylinder(`Dock-base-${side}`, [side * 5.22, 0, 0], 0.60, 0.2, 1);
  cylinder(`Dock-port-${side}`, [side * 5.4, 0, 0], 0.40, 0.22, 2);
  cylinder(`Dock-light-${side}`, [side * 5.52, 0, 0], 0.43, 0.025, 3);
});

// Cross habitat.
cylinder("Cross-habitat", [0, 0, 0], 0.58, 3.5, 0, "z");
[-1, 1].forEach(side => {
  cylinder(`Cross-ring-${side}`, [0, 0, side * 1.7], 0.61, 0.1, 3, "z");
});

// Solar truss. Model uses Y-up.
[-0.3, 0.3].forEach(x => {
  box(`Truss-rail-${x}`, [x, 0.25, 0], [0.07, 0.07, 12], 1);
});

for (let i = 0; i < 30; i++) {
  box(`Truss-rung-${i}`, [0, 0.25, -5.8 + i * 0.4],
    [0.65, 0.05, 0.05], 0);
}

// Eight solar wings.
[-1, 1].forEach(side => {
  [3.4, 5.4].forEach((distance, wing) => {
    [-1, 1].forEach(direction => {
      const x = direction * 2.5;
      const z = side * distance;
      const id = `${side}-${wing}-${direction}`;

      box(`Solar-frame-${id}`, [x, 0.25, z], [3.7, 0.09, 1.45], 1);
      box(`Solar-cells-${id}`, [x, 0.31, z], [3.57, 0.035, 1.32], 2);

      for (let j = 0; j < 12; j++) {
        box(`Cell-divider-${id}-${j}`,
          [x - 1.65 + j * 0.3, 0.335, z], [0.014, 0.012, 1.32], 1);
      }

      box(`Solar-bus-${id}`, [x, 0.345, z], [3.55, 0.012, 0.025], 4);
    });
  });
});

// Radiators and antenna.
[-1, 1].forEach(side => {
  box(`Radiator-${side}`, [-2.6, 0.9, side * 1.05], [1.7, 0.08, 0.65], 0);

  for (let i = 0; i < 8; i++) {
    box(`Radiator-fin-${side}-${i}`,
      [-3.32 + i * 0.2, 0.955, side * 1.05], [0.025, 0.02, 0.6], 1);
  }
});

cylinder("Antenna-mast", [2, 1.15, 0], 0.035, 1.1, 1, "y");
cylinder("Antenna-dish", [2, 1.72, 0], 0.45, 0.07, 0, "y");
cylinder("Antenna-center", [2, 1.80, 0], 0.10, 0.12, 3, "y");

function normal(a, b, c) {
  const u = b.map((v, i) => v - a[i]);
  const v = c.map((n, i) => n - a[i]);
  const n = [
    u[1]*v[2] - u[2]*v[1],
    u[2]*v[0] - u[0]*v[2],
    u[0]*v[1] - u[1]*v[0],
  ];
  const length = Math.hypot(...n) || 1;
  return n.map(v => v / length);
}

function exportGLB(filename, hologram) {
  const chunks = [];
  let byteLength = 0;

  const gltf = {
    asset: {
      version: "2.0",
      generator: "NasaTwisters Concept Habitat",
      extras: { description: "Original conceptual habitat; not an accurate ISS replica." },
    },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: hologram ? [{
      name: "Cyan holographic lines",
      pbrMetallicRoughness: {
        baseColorFactor: [0.38, 0.85, 0.93, 1],
        metallicFactor: 0,
        roughnessFactor: 0.6,
      },
      emissiveFactor: [0.25, 0.65, 0.8],
    }] : palette.map((m, i) => ({
      name: m.name,
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: m.color,
        metallicFactor: i === 3 ? 0.15 : 0.55,
        roughnessFactor: 0.38,
      },
      ...(i === 3 ? { emissiveFactor: [0.1, 0.55, 0.65] } : {}),
    })),
    buffers: [],
    bufferViews: [],
    accessors: [],
  };

  function accessor(values, includeBounds = false) {
    const array = new Float32Array(values);
    const data = Buffer.from(array.buffer);
    const view = gltf.bufferViews.length;

    gltf.bufferViews.push({
      buffer: 0, byteOffset: byteLength, byteLength: data.length,
      target: 34962,
    });

    chunks.push(data);
    byteLength += data.length;

    const entry = {
      bufferView: view, componentType: 5126,
      count: values.length / 3, type: "VEC3",
    };

    if (includeBounds) {
      entry.min = [Infinity, Infinity, Infinity];
      entry.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < values.length; i++) {
        const axis = i % 3;
        entry.min[axis] = Math.min(entry.min[axis], values[i]);
        entry.max[axis] = Math.max(entry.max[axis], values[i]);
      }
    }

    gltf.accessors.push(entry);
    return gltf.accessors.length - 1;
  }

  for (const object of objects) {
    // Leave tiny surface details out of the hologram.
    if (hologram && /Cell-divider|Hull-panel|Radiator-fin/.test(object.name)) continue;

    const positions = [];
    const normals = [];

    if (hologram) {
      const edges = new Set();

      for (const triangle of object.triangles) {
        for (let i = 0; i < 3; i++) {
          const a = triangle[i];
          const b = triangle[(i + 1) % 3];
          edges.add([Math.min(a, b), Math.max(a, b)].join(","));
        }
      }

      for (const edge of edges) {
        const [a, b] = edge.split(",").map(Number);
        positions.push(...object.vertices[a], ...object.vertices[b]);
      }
    } else {
      for (const triangle of object.triangles) {
        const [a, b, c] = triangle.map(i => object.vertices[i]);
        const n = normal(a, b, c);
        positions.push(...a, ...b, ...c);
        normals.push(...n, ...n, ...n);
      }
    }

    const attributes = { POSITION: accessor(positions, true) };
    if (!hologram) attributes.NORMAL = accessor(normals);

    const mesh = gltf.meshes.length;
    gltf.meshes.push({
      name: object.name,
      primitives: [{
        attributes,
        material: hologram ? 0 : object.material,
        mode: hologram ? 1 : 4,
      }],
    });

    const node = gltf.nodes.length;
    gltf.nodes.push({ name: object.name, mesh });
    gltf.scenes[0].nodes.push(node);
  }

  gltf.buffers.push({ byteLength });

  const json = Buffer.from(JSON.stringify(gltf));
  const jsonPadding = Buffer.alloc((4 - json.length % 4) % 4, 0x20);
  const jsonChunk = Buffer.concat([json, jsonPadding]);
  const binary = Buffer.concat(chunks);

  function header(length, type) {
    const result = Buffer.alloc(8);
    result.writeUInt32LE(length, 0);
    result.writeUInt32LE(type, 4);
    return result;
  }

  const fileHeader = Buffer.alloc(12);
  fileHeader.writeUInt32LE(0x46546c67, 0);
  fileHeader.writeUInt32LE(2, 4);
  fileHeader.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binary.length, 8);

  const result = Buffer.concat([
    fileHeader,
    header(jsonChunk.length, 0x4e4f534a), jsonChunk,
    header(binary.length, 0x004e4942), binary,
  ]);

  const destination = path.join(output, filename);
  fs.writeFileSync(destination, result);
  console.log(`Creado: ${destination}`);
}

exportGLB("twisters-station-solid.glb", false);
exportGLB("twisters-station-hologram.glb", true);
console.log("\nListo: tus dos modelos están en dashboard/public/models/");