// Logic chính: chạy Đồ thị trừu tượng & Bản đồ thực (Leaflet + OSRM)

const state = {
  viewMode: 'abstract', // 'abstract' or 'map'
  nodes: new Set(),
  edges: [], 
  duplicatedEdges: [],
  route: [],
  routeLengthOriginal: 0,
  routeLengthOptimized: 0,
  isConnected: false,
  eulerType: "unknown",
  oddNodes: [],
  simIndex: 0,
  simProgress: 0,
  simRunning: false,
  simSpeed: 1,
  
  // Abstract layout coordinates {x, y} relative
  drawNodes: new Map(),
  
  // Real Map coordinates [lat, lng]
  mapNodes: new Map(),
};

const elements = {};
let svgZoom = 1;  // current zoom scale
let panX = 0, panY = 0;  // current pan offset
let panMode = true;       // pan mode toggle — bật mặc định
let isPanning = false;    // mouse is held down
function $(id) { return document.getElementById(id); }

function cacheElements() {
  Object.assign(elements, {
    edgeTableBody: $("edge-table-body"),
    bulkEdges: $("bulk-edges"),
    bulkAddBtn: $("bulk-add-btn"),
    loadSample: $("load-sample"),
    clearGraph: $("clear-graph"),
    startNode: $("start-node"),
    returnStart: $("return-start"),
    analyzeBtn: $("analyze-btn"),
    computeRouteBtn: $("compute-route-btn"),
    playBtn: $("play-btn"),
    pauseBtn: $("pause-btn"),
    resetBtn: $("reset-btn"),
    infoBtn: $("info-btn"),
    speedRange: $("speed-range"),
    speedLabel: $("speed-label"),
    
    // Areas
    abstractContainer: $("abstract-container"),
    mapContainer: $("map-container"),
    graphEmptyHint: $("graph-empty-hint"),
    graphSvg: $("graph-svg"),
    sweeperSvg: $("sweeper-icon-svg"),
    
    modeAbstractBtn: $("mode-abstract-btn"),
    modeMapBtn: $("mode-map-btn"),
    statusIndicator: $("system-status-indicator"),
    
    // KPIs
    statNodes: $("stat-nodes"),
    statEdges: $("stat-edges"),
    statLengthOriginal: $("stat-length-original"),
    statLengthOptimized: $("stat-length-optimized"),
    algoExplanation: $("algo-explanation"),
    statFuel: $("stat-fuel"),
    statCo2: $("stat-co2"),
    exportBtn: $("export-btn"),
    
    // Modal Details
    detailsModal: $("details-modal"),
    closeModalBtn: $("close-modal-btn"),
    modalSummary: $("modal-summary"),
    modalDupList: $("modal-dup-list"),
    modalRouteSteps: $("modal-route-steps"),
    modalExportBtn: $("modal-export-btn"),
    modalStartBtn: $("modal-start-btn"),
    
    eulerStatus: $("euler-status"),
    oddNodesList: $("odd-nodes-list"),
    routeSteps: $("route-steps"),
    
    // Progress
    progressFill: $("progress-fill"),
    progressPercent: $("progress-percent"),
    progressDistance: $("progress-distance"),
    statusLog: $("status-log")
  });
}

function logStatus(msg) {
  if(!elements.statusLog) return;
  const time = new Date().toLocaleTimeString("vi-VN");
  elements.statusLog.textContent = `[${time}] ${msg}`;
}

// ==== ALGORITHM (EULER / CHINESE POSTMAN) ====
function recomputeNodes() {
  state.nodes = new Set();
  state.routeLengthOriginal = 0;
  state.edges.forEach(e => { 
    state.nodes.add(e.from); 
    state.nodes.add(e.to); 
    state.routeLengthOriginal += Number(e.length);
  });
}

function getAdjacency() {
  const adj = new Map();
  state.nodes.forEach(n => adj.set(n, []));
  state.edges.forEach(e => { adj.get(e.from).push(e.to); adj.get(e.to).push(e.from); });
  return adj;
}

function analyzeEuler() {
  const adj = getAdjacency();
  state.oddNodes = Array.from(state.nodes).filter(n => adj.get(n).length % 2 !== 0);
  
  // check connectivity
  state.isConnected = true;
  if(state.nodes.size > 0) {
    let start = Array.from(state.nodes).find(n => adj.get(n).length > 0);
    if(start) {
      const visited = new Set(), stack = [start];
      while(stack.length) {
        const n = stack.pop();
        if(visited.has(n)) continue;
        visited.add(n);
        adj.get(n).forEach(nb => { if(!visited.has(nb)) stack.push(nb); });
      }
      state.isConnected = Array.from(state.nodes).every(n => adj.get(n).length === 0 || visited.has(n));
    } else {
      state.isConnected = false;
    }
  }

  if (!state.isConnected) state.eulerType = "none";
  else if (state.oddNodes.length === 0) state.eulerType = "eulerian";
  else if (state.oddNodes.length === 2) state.eulerType = "semi";
  else state.eulerType = "none";
}

function hierholzer(startNode, edges) {
  const adj = new Map();
  edges.forEach((e, idx) => {
    const key = `${e.from}|${e.to}|${e.id}|${idx}`;
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push({ to: e.to, edge: e, key });
    adj.get(e.to).push({ to: e.from, edge: e, key });
  });

  // Use pointer-per-node instead of mutating arrays (avoids breaking reconstruction)
  const ptr = new Map();
  adj.forEach((_, n) => ptr.set(n, 0));

  const edgeUsed = new Set();
  const stack = [startNode];
  const pathNodes = [];

  while (stack.length > 0) {
    const v = stack[stack.length - 1];
    const nbs = adj.get(v) || [];
    let p = ptr.get(v) || 0;
    // Advance pointer past used edges
    while (p < nbs.length && edgeUsed.has(nbs[p].key)) p++;
    ptr.set(v, p);

    if (p < nbs.length) {
      const chosen = nbs[p];
      ptr.set(v, p + 1);
      edgeUsed.add(chosen.key);
      stack.push(chosen.to);
    } else {
      pathNodes.push(stack.pop());
    }
  }

  pathNodes.reverse();

  // Reconstruct edge list from node sequence
  const usedInRecon = new Set();
  const pathEdges = [];
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const u = pathNodes[i], v = pathNodes[i + 1];
    const nbs = adj.get(u) || [];
    for (const candidate of nbs) {
      if (candidate.to === v && !usedInRecon.has(candidate.key)) {
        usedInRecon.add(candidate.key);
        pathEdges.push({ edge: candidate.edge, from: u, to: v });
        break;
      }
    }
  }
  return pathEdges;
}

function computeChinesePostman(start) {
  if (state.edges.length === 0) return;
  analyzeEuler();
  state.routeLengthOriginal = state.edges.reduce((s, e) => s + e.length, 0);
  let workingEdges = [...state.edges];
  state.duplicatedEdges = [];

  const needMatching = !(elements.returnStart && !elements.returnStart.checked && state.eulerType === "semi" && state.oddNodes.includes(start));

  if (state.eulerType !== "eulerian" && needMatching) {
    const m = state.oddNodes.length;
    if (m > 0 && m <= 16 && m % 2 === 0) {
      // Dijkstra distances between odd nodes
      const adj = new Map();
      state.nodes.forEach(n => adj.set(n, []));
      state.edges.forEach(e => {
        adj.get(e.from).push({ to: e.to, w: e.length });
        adj.get(e.to).push({ to: e.from, w: e.length });
      });

      function dijkstra(source) {
        const dist = new Map(), prev = new Map(), visited = new Set();
        state.nodes.forEach(n => dist.set(n, Infinity));
        dist.set(source, 0);
        while (true) {
          let u = null, best = Infinity;
          for (const [node, d] of dist.entries()) {
            if (!visited.has(node) && d < best) { best = d; u = node; }
          }
          if (u === null) break;
          visited.add(u);
          (adj.get(u) || []).forEach(({ to, w }) => {
            if (dist.get(u) + w < dist.get(to)) {
              dist.set(to, dist.get(u) + w);
              prev.set(to, u);
            }
          });
        }
        return { dist, prev };
      }

      const oddDist = Array(m).fill(0).map(()=>Array(m).fill(0));
      const allPrev = {};
      for (let i = 0; i < m; i++) {
        const { dist, prev } = dijkstra(state.oddNodes[i]);
        allPrev[state.oddNodes[i]] = prev;
        for (let j = 0; j < m; j++) oddDist[i][j] = dist.get(state.oddNodes[j]);
      }

      // Bitmask DP Perfect Matching
      const size = 1 << m;
      const dp = new Array(size).fill(Infinity);
      const choice = new Array(size).fill(null);
      dp[0] = 0;

      for (let mask = 1; mask < size; mask++) {
        let i = 0; while (i < m && ((mask >> i) & 1) === 0) i++;
        if (i >= m) continue;
        for (let j = i + 1; j < m; j++) {
          if ((mask >> j) & 1) {
            const cost = oddDist[i][j] + dp[mask ^ (1 << i) ^ (1 << j)];
            if (cost < dp[mask]) { dp[mask] = cost; choice[mask] = [i, j]; }
          }
        }
      }

      const pairs = [];
      let mask = size - 1;
      while (mask && choice[mask]) {
        const [i, j] = choice[mask];
        pairs.push([state.oddNodes[i], state.oddNodes[j]]);
        mask ^= (1 << i) ^ (1 << j);
      }

      let dupIndex = 1;
      pairs.forEach(([u, v]) => {
        const path = [], prevMap = allPrev[u];
        let cur = v;
        while (cur !== undefined && cur !== u) { path.push(cur); cur = prevMap.get(cur); }
        if (cur === u) {
          path.push(u); path.reverse();
          for (let k = 0; k < path.length - 1; k++) {
            const a = path[k], b = path[k+1];
            const base = state.edges.find(e => (e.from === a && e.to === b) || (e.from === b && e.to === a));
            if (base) {
              const ndup = { ...base, id: `${base.id}_dup${dupIndex++}`, duplicateOf: base.id };
              // copy cached geometry if exists
              if(base.geomPath) ndup.geomPath = base.geomPath;
              state.duplicatedEdges.push(ndup);
            }
          }
        }
      });
      workingEdges = [...state.edges, ...state.duplicatedEdges];
    } else if (m > 16) {
      logStatus("Mạng lưới quá phức tạp, đã bỏ qua bước tối ưu lặp (Greedy) để tránh treo.");
    }
  }

  const routeEdges = hierholzer(start, workingEdges);
  state.route = routeEdges.map(step => ({ ...step, isDuplicate: !!step.edge.duplicateOf }));
  state.routeLengthOptimized = workingEdges.reduce((s, e) => s + e.length, 0);
}

// ==== ABSTRACT VIEW LOGIC (SVG) ====
function computeLayoutAbstract() {
  const positions = new Map();
  const nodesArr = Array.from(state.nodes);
  const n = nodesArr.length;
  // Use relative SVG coords [0, 1]
  nodesArr.forEach((node, idx) => {
    if (state.drawNodes.has(node)) {
      positions.set(node, state.drawNodes.get(node));
    } else {
      const angle = (2 * Math.PI * idx) / Math.max(1, n);
      const x = 0.5 + 0.4 * Math.cos(angle);
      const y = 0.5 + 0.4 * Math.sin(angle);
      positions.set(node, { x, y });
      state.drawNodes.set(node, { x, y });
    }
  });
  return positions;
}

function renderGraphAbstract() {
  const svg = elements.graphSvg;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!state.edges.length) return;

  const w = svg.clientWidth || 600, h = svg.clientHeight || 400;
  const cx = w / 2, cy = h / 2;
  const positions = computeLayoutAbstract();

  // Wrapper group - all content scaled inside here so the SVG always fills 100%
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("id", "svg-main-group");
  svg.appendChild(g);
  setSvgTransform(); // apply current zoom+pan

  state.edges.forEach(e => {
    const p1 = positions.get(e.from), p2 = positions.get(e.to);
    if (!p1 || !p2) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", p1.x * w); line.setAttribute("y1", p1.y * h);
    line.setAttribute("x2", p2.x * w); line.setAttribute("y2", p2.y * h);
    line.setAttribute("stroke", "rgba(56, 189, 248, 0.4)"); line.setAttribute("stroke-width", "4");
    line.setAttribute("stroke-linecap", "round"); line.dataset.edgeId = e.id;
    g.appendChild(line);
  });

  state.duplicatedEdges.forEach(e => {
    const p1 = positions.get(e.from), p2 = positions.get(e.to);
    if (!p1 || !p2) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", p1.x * w); line.setAttribute("y1", p1.y * h);
    line.setAttribute("x2", p2.x * w); line.setAttribute("y2", p2.y * h);
    line.setAttribute("stroke", "rgba(239,68,68,0.5)"); line.setAttribute("stroke-width", "5");
    line.setAttribute("stroke-dasharray", "8,6"); line.dataset.edgeId = e.id;
    line.classList.add("virtual-edge");
    g.appendChild(line);
  });

  state.nodes.forEach(n => {
    const p = positions.get(n);
    if (!p) return;
    const grp = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p.x * w); circle.setAttribute("cy", p.y * h);
    circle.setAttribute("r", 15); circle.setAttribute("fill", "#0f172a");
    circle.setAttribute("stroke", "rgba(16, 185, 129, 0.8)"); circle.setAttribute("stroke-width", "2");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", p.x * w); text.setAttribute("y", p.y * h + 4);
    text.setAttribute("text-anchor", "middle"); text.setAttribute("font-size", "12");
    text.setAttribute("fill", "#fff"); text.setAttribute("font-weight", "bold");
    text.textContent = n;
    grp.appendChild(circle); grp.appendChild(text); g.appendChild(grp);
  });
}

function updateEdgeStylesAbstract(progressIndex) {
  const svg = elements.graphSvg;
  const doneSet = new Set();
  for(let i=0; i<progressIndex; i++) if (state.route[i]?.edge) doneSet.add(state.route[i].edge.id);
  const curId = state.route[progressIndex]?.edge?.id;

  Array.from(svg.querySelectorAll("line[data-edge-id]")).forEach(line => {
    const id = line.dataset.edgeId;
    const isVirtual = line.classList.contains("virtual-edge");
    
    if(id === curId) { 
        line.setAttribute("stroke", "#f59e0b"); line.setAttribute("stroke-width", "6"); 
    } else if(doneSet.has(id)) { 
        if(isVirtual) { 
            line.setAttribute("stroke", "rgba(239, 68, 68, 0.9)"); 
            line.setAttribute("stroke-width", "5"); 
        } else { 
            line.setAttribute("stroke", "#10b981"); 
            line.setAttribute("stroke-width", "4"); 
        }
    } else { 
        if(isVirtual) { 
            line.setAttribute("stroke", "rgba(239, 68, 68, 0.4)"); 
            line.setAttribute("stroke-width", "5"); 
        } else { 
            line.setAttribute("stroke", "rgba(56, 189, 248, 0.4)"); 
            line.setAttribute("stroke-width", "4"); 
        }
    }
  });
}

// Chuyển tọa độ graph (px, py) sang tọa độ màn hình theo zoom+pan hiện tại
function transformPoint(px, py, w, h) {
  const cx = w / 2, cy = h / 2;
  return {
    x: svgZoom * (px - cx) + cx + panX,
    y: svgZoom * (py - cy) + cy + panY
  };
}

function updateSweeperAbstract() {
  const truck = elements.sweeperSvg;
  if (!state.route.length || state.simProgress <= 0) { truck.style.opacity=0; return; }
  
  const w = elements.graphSvg.clientWidth || 600, h = elements.graphSvg.clientHeight || 400;
  const positions = computeLayoutAbstract();
  
  const idx = Math.floor(state.simProgress);
  if (idx >= state.route.length) {
    const last = state.route[state.route.length - 1];
    if (last) {
      const p = positions.get(last.to);
      if (p) {
        const sc = transformPoint(p.x * w, p.y * h, w, h);
        truck.style.opacity = 1;
        truck.style.left = sc.x + "px";
        truck.style.top  = sc.y + "px";
      }
    }
    return;
  }
  
  const step = state.route[idx];
  const p1 = positions.get(step.from), p2 = positions.get(step.to);
  if (!p1 || !p2) return;
  const t = Math.max(0, Math.min(1, state.simProgress - idx));
  
  const rawX = (p1.x + (p2.x - p1.x) * t) * w;
  const rawY = (p1.y + (p2.y - p1.y) * t) * h;
  const sc = transformPoint(rawX, rawY, w, h);
  
  truck.style.opacity = 1;
  truck.style.left = sc.x + "px";
  truck.style.top  = sc.y + "px";
}

// ==== LEAFLET VIEW LOGIC (MAP OVERLAY) ====
let map = null;
let sweeperMarker = null;
let mapLayers = [];
const mapCenter = [10.7725, 106.6980]; // Ben Thanh

function initLeafletMap() {
  if (map) return;
  map = L.map('map-container', { zoomControl: false }).setView(mapCenter, 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  sweeperMarker = L.marker(mapCenter, {
    icon: L.divIcon({ html: '<div class="sweeper-hud-icon">🚛</div>', className: '', iconSize:[30,30], iconAnchor:[15,15] })
  });
}

function computeLayoutMap() {
  const positions = new Map();
  const nodesArr = Array.from(state.nodes);
  const n = nodesArr.length;
  nodesArr.forEach((node, idx) => {
    if (state.mapNodes.has(node)) {
      positions.set(node, state.mapNodes.get(node));
    } else {
      const angle = (2 * Math.PI * idx) / Math.max(1, n);
      const r = 0.008; 
      positions.set(node, [mapCenter[0] + r*Math.sin(angle), mapCenter[1] + r*Math.cos(angle)]);
      state.mapNodes.set(node, positions.get(node));
    }
  });
  return positions;
}

// Function to get real roads from OSRM
async function getRoadGeometry(lat1, lng1, lat2, lng2) {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]); // Leaflet uses [lat, lng]
    }
  } catch(e) { }
  return [[lat1, lng1], [lat2, lng2]]; // fallback straight line
}

async function resolveMapGeometries() {
  const positions = computeLayoutMap();
  for(let e of state.edges) {
    if(!e.geomPath) {
      const p1 = positions.get(e.from), p2 = positions.get(e.to);
      e.geomPath = await getRoadGeometry(p1[0], p1[1], p2[0], p2[1]);
    }
  }
}

function renderGraphMap() {
  if (!map) return;
  mapLayers.forEach(l => map.removeLayer(l));
  mapLayers = [];
  if (!state.edges.length) {
    if (map.hasLayer(sweeperMarker)) map.removeLayer(sweeperMarker);
    return;
  }

  const positions = computeLayoutMap();
  const bounds = L.latLngBounds(Array.from(positions.values()));
  setTimeout(() => map.fitBounds(bounds, { padding: [50, 50] }), 100);

  // Note: we assume geomPath is populated. If not it draws straight lines.
  state.edges.forEach(e => {
    const path = e.geomPath || [positions.get(e.from), positions.get(e.to)];
    const polyline = L.polyline(path, { color: 'rgba(56, 189, 248, 0.4)', weight: 4, lineCap: 'round' }).addTo(map);
    polyline._edgeId = e.id;
    mapLayers.push(polyline);
  });

  state.duplicatedEdges.forEach(e => {
    const path = e.geomPath || [positions.get(e.from), positions.get(e.to)];
    const polyline = L.polyline(path, { color: 'rgba(239, 68, 68, 0.6)', weight: 6, dashArray: '6,6' }).addTo(map);
    polyline._isDup = true;
    mapLayers.push(polyline);
  });

  state.nodes.forEach(n => {
    const circle = L.circleMarker(positions.get(n), { radius: 6, fillColor: '#0f172a', color: '#10b981', weight: 2, fillOpacity: 1 }).addTo(map);
    circle.bindTooltip(n, { permanent: true, direction: "center", className: "node-tooltip" });
    mapLayers.push(circle);
  });
}

function updateEdgeStylesMap(progressIndex) {
  if (!map) return;
  const doneSet = new Set();
  for(let i=0; i<progressIndex; i++) if (state.route[i]?.edge) doneSet.add(state.route[i].edge.id);
  const curId = state.route[progressIndex]?.edge?.id;

  mapLayers.forEach(layer => {
    if (layer instanceof L.Polyline && !layer._isDup && layer._edgeId) {
      if(layer._edgeId === curId) layer.setStyle({ color: '#f59e0b', weight: 6 });
      else if(doneSet.has(layer._edgeId)) layer.setStyle({ color: '#10b981', weight: 4 });
      else layer.setStyle({ color: 'rgba(56, 189, 248, 0.3)', weight: 4 });
    }
  });
}

// Function to interpolate along curved polyline!
function getPointAlongPath(points, t) {
  if(!points || points.length === 0) return null;
  if(points.length === 1 || t <= 0) return points[0];
  if(t >= 1) return points[points.length-1];

  let totalDist = 0; const dists = [0];
  for(let i=0; i<points.length-1; i++){
    totalDist += Math.hypot(points[i+1][0]-points[i][0], points[i+1][1]-points[i][1]);
    dists.push(totalDist);
  }
  
  const targetDist = totalDist * t;
  for(let i=0; i<points.length-1; i++){
    if(targetDist >= dists[i] && targetDist <= dists[i+1]) {
      const segFrac = (targetDist - dists[i]) / (dists[i+1] - dists[i] || 1);
      return [
        points[i][0] + (points[i+1][0]-points[i][0])*segFrac,
        points[i][1] + (points[i+1][1]-points[i][1])*segFrac
      ];
    }
  }
  return points[points.length-1];
}

function updateSweeperMap() {
  if (!map || !state.route.length) {
      if(map && map.hasLayer(sweeperMarker)) map.removeLayer(sweeperMarker);
      return;
  }
  
  if (state.simProgress <= 0) {
    const first = state.route[0];
    if(first && first.edge && first.edge.geomPath) {
      if(!map.hasLayer(sweeperMarker)) sweeperMarker.addTo(map);
      sweeperMarker.setLatLng(first.edge.geomPath[first.edge.from === first.from ? 0 : first.edge.geomPath.length-1]);
    }
    return;
  }

  const idx = Math.floor(state.simProgress);
  if (idx >= state.route.length) {
    const last = state.route[state.route.length-1];
    if(last && last.edge && last.edge.geomPath) {
       sweeperMarker.setLatLng(last.edge.geomPath[last.edge.from === last.from ? last.edge.geomPath.length-1 : 0]);
    }
    return;
  }

  const step = state.route[idx];
  if(!step || !step.edge.geomPath) return;

  // check if path needs reversal based on direction
  const path = step.edge.from === step.from ? step.edge.geomPath : [...step.edge.geomPath].reverse();
  const t = Math.max(0, Math.min(1, state.simProgress - idx));
  const pos = getPointAlongPath(path, t);
  
  if(pos) {
    if(!map.hasLayer(sweeperMarker)) sweeperMarker.addTo(map);
    sweeperMarker.setLatLng(pos);
  }
}

// ==== SWITCH VIEWS ====
async function switchViewMode(mode) {
  state.viewMode = mode;
  elements.modeAbstractBtn.classList.toggle('active', mode==='abstract');
  elements.modeAbstractBtn.classList.toggle('secondary', mode!=='abstract');
  elements.modeMapBtn.classList.toggle('active', mode==='map');
  elements.modeMapBtn.classList.toggle('secondary', mode!=='map');
  
  elements.statusIndicator.textContent = mode==='abstract' ? "Hệ thống Trừu tượng" : "Kết nối Vệ tinh GPS";

  if (mode === 'abstract') {
    elements.mapContainer.style.display = 'none';
    elements.abstractContainer.style.display = 'block';
    renderGraphAbstract();
    updateEdgeStylesAbstract(state.simIndex);
    updateSweeperAbstract();
  } else {
    elements.abstractContainer.style.display = 'none';
    elements.mapContainer.style.display = 'block';
    initLeafletMap();
    logStatus("Đang định tuyến OSRM để vạch đường ôm theo thực tế...");
    await resolveMapGeometries(); // snap to roads
    renderGraphMap();
    updateEdgeStylesMap(state.simIndex);
    updateSweeperMap();
    map.invalidateSize(); // Fix leafet missing grey tiles
  }
}

// ==== UI & ANIMATION ====
function updateProgressUI() {
  const totalSteps = state.route.length;
  const currentIndex = Math.min(state.simProgress, totalSteps);
  const completedSteps = Math.floor(currentIndex);
  
  let doneDist = state.route.slice(0, completedSteps).reduce((s, step) => s + step.edge.length, 0);
  if (completedSteps < totalSteps) {
      const frac = currentIndex - completedSteps;
      const step = state.route[completedSteps];
      doneDist += (step && step.edge ? step.edge.length : 0) * frac;
  }
  const percent = totalSteps === 0 ? 0 : Math.min(100, Math.round((doneDist / state.routeLengthOptimized) * 100));
  
  elements.progressFill.style.width = `${percent}%`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressDistance.textContent = `${Math.round(doneDist)} / ${state.routeLengthOptimized} km`;

  if (elements.statFuel) elements.statFuel.textContent = (doneDist * 0.2).toFixed(1);
  if (elements.statCo2) elements.statCo2.textContent = (doneDist * 0.2 * 0.5).toFixed(1);
}

let lastTimestamp = null;
function animate(timestamp) {
  if (!state.simRunning) lastTimestamp = null;
  else {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    state.simProgress += dt * (state.simSpeed * 0.5);

    const nextIndex = Math.floor(state.simProgress);
    if (nextIndex !== state.simIndex) {
      state.simIndex = nextIndex;
      if (state.simIndex >= state.route.length) {
        state.simIndex = state.route.length;
        state.simRunning = false;
        logStatus("Thành công: Đã quét toàn bộ lộ trình.");
      }
      if(state.viewMode==='abstract') updateEdgeStylesAbstract(state.simIndex);
      else updateEdgeStylesMap(state.simIndex);
    }
    updateProgressUI();
  }
  
  if(state.viewMode==='abstract') updateSweeperAbstract();
  else updateSweeperMap();
  
  requestAnimationFrame(animate);
}

function refreshUI() {
  elements.graphEmptyHint.style.display = state.edges.length ? "none" : "flex";

  elements.edgeTableBody.innerHTML = "";
  state.edges.forEach((e) => {
    elements.edgeTableBody.insertAdjacentHTML('beforeend', `<div class="list-row"><span>${e.id}</span><span>${e.from}</span><span>${e.to}</span><span>${e.length}</span></div>`);
  });

  elements.startNode.innerHTML = `<option value="" disabled selected>Chọn trạm xuất phát</option>`;
  state.nodes.forEach(n => elements.startNode.insertAdjacentHTML('beforeend', `<option value="${n}">${n}</option>`));

  elements.statNodes.textContent = state.nodes.size;
  elements.statEdges.textContent = state.edges.length;
  elements.statLengthOriginal.textContent = state.routeLengthOriginal.toFixed(1);
  elements.statLengthOptimized.textContent = state.routeLengthOptimized.toFixed(1);

  if (state.edges.length > 0) {
    const baseLen = state.routeLengthOriginal;
    const optLen = state.routeLengthOptimized;
    const penalty = optLen - baseLen;
    const pct = optLen > 0 ? ((penalty / optLen) * 100).toFixed(1) : 0;
    
    // Tạo string Hành trình tóm tắt A -> B -> C
    const summaryRoute = state.route.length 
      ? state.route.map(s => s.from).join(" ➔ ") + " ➔ " + state.route[state.route.length - 1].to 
      : "Chưa tính toán";
    
    // Chỉ hiện giải thích chi tiết khi đã giải xong thuật toán (quãng đường > 0)
    if (optLen > 0) {
      elements.algoExplanation.innerHTML = `
        - Đồ thị gồm: <strong style="color:#fff">${state.nodes.size} Đỉnh</strong> và <strong style="color:#fff">${state.edges.length} Cạnh</strong><br>
        - Tổng chiều dài ban đầu (Không tính lặp): <strong style="color:#fff">${baseLen.toFixed(1)} km</strong><br>
        - Tổng chiều dài Tối ưu (Chinese Postman): <strong style="color:var(--accent)">${optLen.toFixed(1)} km</strong><br>
        - Phần quãng đường phải đi lặp lại: <strong style="color:var(--warning)">${penalty.toFixed(1)} km (${pct}% tổng lộ trình)</strong><br>
        - Lộ trình tóm tắt: <strong style="color:var(--accent); font-family:'JetBrains Mono';">${summaryRoute}</strong>
      `;
    } else {
      elements.algoExplanation.innerHTML = `Mạng lưới gồm <strong style="color:#fff">${state.nodes.size} đỉnh</strong> và <strong style="color:#fff">${state.edges.length} cạnh</strong>. Vui lòng nhấn "Tính Lộ Trình Tối Ưu" để phân tích Quãng đường lặp lại (Penalty).`;
    }
  } else {
    elements.algoExplanation.innerHTML = "Chưa có dữ liệu mạng lưới để phân tích.";
  }

  const el = elements.eulerStatus;
  el.className = `euler-status ${state.eulerType}`;
  let text = "Chưa nhận diện";
  if (!state.nodes.size) text = "Chưa có dữ liệu";
  else if (!state.isConnected) text = "Lỗi kết nối toàn trình";
  else if (state.eulerType === 'eulerian') text = 'Eulerian (Tối ưu 100%)';
  else if (state.eulerType === 'semi') text = 'Semi-Eulerian (Tốt)';
  else text = `Non-Eulerian (Phải lặp ${state.oddNodes.length} đỉnh)`;
  el.textContent = text;

  elements.oddNodesList.innerHTML = "";
  state.oddNodes.forEach(n => elements.oddNodesList.insertAdjacentHTML('beforeend', `<li>Đỉnh ${n}</li>`));

  elements.routeSteps.innerHTML = "";
  state.route.forEach((s, i) => {
    const dup = s.isDuplicate ? `<span class="dup">ĐI LẶP</span>` : '';
    elements.routeSteps.insertAdjacentHTML('beforeend', `<li><span>${i+1}. ${s.from} ➔ ${s.to} (km:${s.edge.length})</span> ${dup}</li>`);
  });
}

function resetSimulation() {
  state.simIndex = 0; state.simProgress = 0; state.simRunning = false;
  elements.sweeperSvg.style.opacity = 0;
  if(map && map.hasLayer(sweeperMarker)) map.removeLayer(sweeperMarker);
  updateProgressUI(); 
  if(state.viewMode==='abstract') updateEdgeStylesAbstract(0);
  else updateEdgeStylesMap(0);
}

// ==== EVENT HANDLERS ====
async function onBulkAdd() {
  const val = elements.bulkEdges.value.trim();
  if(!val) return;
  val.split("\n").forEach(line => {
    const p = line.trim().replace(/\s+/g," ").split(" ");
    if(p.length >= 3) {
      state.edges.push({ id: `e${state.edges.length+1}`, from: p[0], to: p[1], length: Number(p[2]) });
    }
  });
  recomputeNodes(); refreshUI();
  if(state.viewMode==='abstract') renderGraphAbstract();
  else {
     logStatus("Đang định tuyến...");
     await resolveMapGeometries();
     renderGraphMap();
  }
}

function onAnalyze() { analyzeEuler(); refreshUI(); logStatus("Đã phân tích Euler thành công."); }
function openDetailsModal() {
  if (!state.route.length) {
    // Hiện modal với thông báo nhẹ nhàng thay vì alert xấu
    elements.modalSummary.innerHTML = `
      <div style="text-align:center; padding: 10px 0;">
        <div style="font-size:40px; margin-bottom:10px;">⚠️</div>
        <div style="font-size:14px; font-weight:600; color:#fff; margin-bottom:6px;">Chưa có lộ trình để hiển thị</div>
        <div style="color:var(--text-muted); font-size:12px;">Hãy nhấn <strong style="color:var(--accent)">Tính Lộ Trình Tối Ưu</strong> trước, sau đó mở lại bảng này.</div>
      </div>`;
    elements.modalDupList.innerHTML = "";
    elements.modalRouteSteps.innerHTML = "";
    elements.detailsModal.style.display = "flex";
    return;
  }
  
    // Tổng quan kết quả
  const baseLen = state.routeLengthOriginal;
  const optLen = state.routeLengthOptimized;
  const penalty = optLen - baseLen;
  const pct = optLen > 0 ? ((penalty / optLen) * 100).toFixed(1) : 0;
  
  const summaryRoute = state.route.length 
    ? state.route.map(s => s.from).join(" ➔ ") + " ➔ " + state.route[state.route.length - 1].to 
    : "";

  elements.modalSummary.innerHTML = `
    <div style="font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 8px;">Kết quả & Giới thiệu Tối ưu:</div>
    <div style="color: var(--text-muted); line-height: 1.6; font-size: 13px;">
      - Quy mô Mạng lưới: <strong>${state.nodes.size} Đỉnh (Giao lộ)</strong> và <strong>${state.edges.length} Cạnh (Tuyến đường)</strong><br/>
      - Tổng độ dài ban đầu (Không tính lặp): <strong>${baseLen.toFixed(1)} km</strong><br/>
      - Tổng độ dài sau khi Tối ưu (Chinese Postman): <strong style="color: var(--accent);">${optLen.toFixed(1)} km</strong><br/>
      - Phần quãng đường đi lặp lại: <strong style="color: var(--warning);">${penalty.toFixed(1)} km (${pct}% tổng lộ trình)</strong><br/>
      - Lộ trình tóm tắt: <strong style="color: var(--accent); font-family: 'JetBrains Mono';">${summaryRoute}</strong>
    </div>
  `;
  
  // Danh sách đoạn lặp
  const dupUl = elements.modalDupList;
  dupUl.innerHTML = "";
  if (state.duplicatedEdges.length === 0) {
    dupUl.innerHTML = "<li>Cấu trúc Eulerian hoàn hảo! Không cần quét lặp lại đoạn nào! 💚</li>";
  } else {
    state.duplicatedEdges.forEach(e => {
      dupUl.insertAdjacentHTML('beforeend', `<li>Đoạn lặp: <strong>${e.from} ➔ ${e.to}</strong> (Độ dài: ${e.length} km)</li>`);
    });
  }
  
  const stepsOl = elements.modalRouteSteps;
  stepsOl.innerHTML = "";
  let accumKm = 0;
  state.route.forEach((s, i) => {
    accumKm += (s.edge.length || 0);
    const dupStr = s.isDuplicate ? `<span style="color:var(--warning); margin-left:8px; display:inline-block;">[BỊ PHẠT ĐI LẶP]</span>` : '';
    stepsOl.insertAdjacentHTML('beforeend', `<li style="margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">Nhịp ${i+1}: <strong>${s.from}</strong> đi đến <strong>${s.to}</strong> <span style="color:var(--text-muted)">(Quãng: ${s.edge.length}km | Lũy Kế: ${accumKm.toFixed(1)}km)</span> ${dupStr}</li>`);
  });

  elements.detailsModal.style.display = "flex";
}

function onComputeRoute() {
  const start = elements.startNode.value || Array.from(state.nodes)[0];
  if(!start) return;
  
  // Gán ngược lại vào ComboBox để giao diện hiển thị rõ Điểm xuất phát nào đã được hệ thống chọn mặc định
  elements.startNode.value = start;
  
  computeChinesePostman(start);
  refreshUI(); 
  if(state.viewMode==='map') renderGraphMap(); // redrawn dashed lines dup
  else renderGraphAbstract();
  resetSimulation(); logStatus("Tính lộ trình tối ưu thành công.");
  
  // Mở thẳng modal không hỏi confirm()
  setTimeout(() => openDetailsModal(), 300);
}

async function loadSampleGraph() {
  if (state.viewMode === 'abstract') {
    state.edges = [
      {id:'e1', from:'A', to:'B', length: 2}, {id:'e2', from:'B', to:'C', length: 3},
      {id:'e3', from:'C', to:'A', length: 4}, {id:'e4', from:'A', to:'D', length: 5},
      {id:'e5', from:'C', to:'D', length: 2}
    ];
    state.drawNodes.clear();
    logStatus("Đã nạp bản đồ toán học (Trừu tượng).");
  } else {
    // Real map sample near Ben Thanh Market
    state.edges = [
      {id:'e1', from:'Ngã 6 Phù Đổng', to:'Chợ Bến Thành', length: 0.8},
      {id:'e2', from:'Chợ Bến Thành', to:'Dinh Độc Lập', length: 1.1},
      {id:'e3', from:'Dinh Độc Lập', to:'Ngã 6 Phù Đổng', length: 1.5},
      {id:'e4', from:'Ngã 6 Phù Đổng', to:'Bảo tàng Mỹ thuật', length: 0.5},
      {id:'e5', from:'Bảo tàng Mỹ thuật', to:'Chợ Bến Thành', length: 0.7}
    ];
    state.mapNodes.clear();
    state.mapNodes.set('Ngã 6 Phù Đổng', [10.7712, 106.6923]);
    state.mapNodes.set('Chợ Bến Thành', [10.7725, 106.6980]);
    state.mapNodes.set('Dinh Độc Lập', [10.7770, 106.6954]);
    state.mapNodes.set('Bảo tàng Mỹ thuật', [10.7695, 106.6990]);
    logStatus("Đang nạp Bản đồ Thực Tế (Trung tâm TP.HCM) và gọi OSRM Snap To Roads...");
  }
  
  recomputeNodes(); refreshUI();
  if(state.viewMode==='map') {
      await resolveMapGeometries();
      renderGraphMap();
  } else {
      renderGraphAbstract();
  }
  logStatus("Tải ví dụ mẫu hoàn tất.");
}

function init() {
  cacheElements(); 
  
  elements.modeAbstractBtn.addEventListener("click", () => switchViewMode('abstract'));
  elements.modeMapBtn.addEventListener("click", () => switchViewMode('map'));

  // ===== SHARED SVG TRANSFORM HELPER =====
  window.setSvgTransform = () => {
    const g = $('svg-main-group');
    if (!g) return;
    const svg = elements.graphSvg;
    const cx = (svg.clientWidth || 600) / 2;
    const cy = (svg.clientHeight || 400) / 2;
    g.setAttribute('transform',
      `translate(${cx + panX},${cy + panY}) scale(${svgZoom}) translate(${-cx},${-cy})`);
  };

  // ===== ZOOM =====
  const simArea = $('simulation-area');
  const applyZoom = () => {
    if (state.viewMode === 'abstract') {
      setSvgTransform();
    } else if (map) {
      // Bản đồ: Leaflet native zoom
      const delta = svgZoom > 1 ? 1 : -1;
      map.setZoom(map.getZoom() + delta);
    }
    logStatus(`Zoom: ${Math.round(svgZoom * 100)}%`);
  };
  $('zoom-in-btn').addEventListener('click', () => { svgZoom = Math.min(4, parseFloat((svgZoom + 0.2).toFixed(1))); applyZoom(); });
  $('zoom-out-btn').addEventListener('click', () => { svgZoom = Math.max(0.2, parseFloat((svgZoom - 0.2).toFixed(1))); applyZoom(); });
  $('zoom-reset-btn').addEventListener('click', () => { svgZoom = 1; panX = 0; panY = 0; setSvgTransform(); logStatus('Zoom + Pan reset 1:1'); });

  // ===== PAN TOGGLE + DRAG =====
  const panBtn = $('pan-toggle-btn');
  const abstractEl = $('abstract-container');

  const updatePanCursor = () => {
    if (panMode) {
      abstractEl.style.cursor = isPanning ? 'grabbing' : 'grab';
      panBtn.textContent = '🔓'; // unlocked
      panBtn.style.color = 'var(--accent)';
      panBtn.style.borderColor = 'var(--accent)';
    } else {
      abstractEl.style.cursor = '';
      panBtn.textContent = '🔒'; // locked
      panBtn.style.color = '';
      panBtn.style.borderColor = '';
    }
  };

  panBtn.addEventListener('click', () => {
    panMode = !panMode;
    updatePanCursor();
    logStatus(panMode ? 'Chế độ Kéo thả: Bật' : 'Chế độ Kéo thả: Tắt');
  });

  updatePanCursor(); // áp dụng trạng thái mặc định (bật)

  let dragStartX = 0, dragStartY = 0, dragStartPanX = 0, dragStartPanY = 0;

  abstractEl.addEventListener('mousedown', (e) => {
    if (!panMode || state.viewMode !== 'abstract') return;
    isPanning = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    dragStartPanX = panX; dragStartPanY = panY;
    updatePanCursor();
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = dragStartPanX + (e.clientX - dragStartX);
    panY = dragStartPanY + (e.clientY - dragStartY);
    setSvgTransform();
  });

  window.addEventListener('mouseup', () => {
    if (!isPanning) return;
    isPanning = false;
    updatePanCursor();
  });

  // Touch support
  let touchStartX = 0, touchStartY = 0;
  abstractEl.addEventListener('touchstart', (e) => {
    if (!panMode) return;
    const t = e.touches[0];
    touchStartX = t.clientX; touchStartY = t.clientY;
    dragStartPanX = panX; dragStartPanY = panY;
    e.preventDefault();
  }, { passive: false });

  abstractEl.addEventListener('touchmove', (e) => {
    if (!panMode) return;
    const t = e.touches[0];
    panX = dragStartPanX + (t.clientX - touchStartX);
    panY = dragStartPanY + (t.clientY - touchStartY);
    setSvgTransform();
    e.preventDefault();
  }, { passive: false });


  // ===== FULLSCREEN (chỉ khu vực mô phỏng) =====
  $('fullscreen-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      simArea.requestFullscreen && simArea.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    $('fullscreen-btn').textContent = isFs ? '⊹' : '⛶';
    $('fullscreen-btn').title = isFs ? 'Thoát toàn màn hình' : 'Phóng to toàn màn hình';
    if (isFs) {
      // Khi vào fullscreen: reset zoom và bỏ transform để biểu đồ hiện đúng 100%
      svgZoom = 1;
      const ac = $('abstract-container'), mc = $('map-container');
      if (ac) { ac.style.transform = ''; ac.style.width = '100%'; ac.style.height = '100%'; }
      if (mc) { mc.style.transform = ''; mc.style.width = '100%'; mc.style.height = '100%'; }
    }
    if (map) setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => renderGraphAbstract(), 250); // re-render for correct sizing
  });
  
  elements.bulkAddBtn.addEventListener("click", onBulkAdd);
  elements.loadSample.addEventListener("click", loadSampleGraph);
  elements.clearGraph.addEventListener("click", () => { state.edges=[]; state.drawNodes.clear(); state.mapNodes.clear(); recomputeNodes(); refreshUI(); switchViewMode(state.viewMode); logStatus("Đã xoá bộ nhớ.");});
  elements.analyzeBtn.addEventListener("click", onAnalyze);
  elements.computeRouteBtn.addEventListener("click", onComputeRoute);
  
  elements.playBtn.addEventListener("click", () => { if(state.route.length) { state.simRunning=true; logStatus("Xe quét đang hoạt động..."); }});
  elements.pauseBtn.addEventListener("click", () => state.simRunning=false);
  elements.resetBtn.addEventListener("click", resetSimulation);
  elements.infoBtn.addEventListener("click", openDetailsModal);
  
  // Modal Actions
  elements.closeModalBtn.addEventListener("click", () => elements.detailsModal.style.display = "none");
  elements.modalExportBtn.addEventListener("click", () => elements.exportBtn.click());
  elements.modalStartBtn.addEventListener("click", () => {
    elements.detailsModal.style.display = "none";
    elements.playBtn.click();
  });
  
  elements.speedRange.addEventListener("input", e => { const v=Number(e.target.value); state.simSpeed=v; elements.speedLabel.textContent=v+"x"; });
  
  elements.exportBtn.addEventListener("click", () => {
    if (!state.route.length) {
      alert("Chưa có lộ trình để xuất báo cáo!");
      return;
    }
    // Kèm theo ký tự BOM \uFEFF để Excel nhận diện chuẩn tiếng Việt UTF-8
    let csv = "\uFEFFBuoc,Tu,Den,DoDai_Km,Loai\n" + state.route.map((s,i) => `${i+1},${s.from},${s.to},${s.edge.length},${s.isDuplicate?'Duong_Lap_Lai':'Duong_Goc'}`).join("\n");
    
    // Sử dụng Blob API thay vì data: URI để hiển thị tải xuống tương thích mọi trình duyệt
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); 
    a.href = url; 
    
    // Tạo tên file mang tính báo cáo chuyên nghiệp
    const timeStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
    a.download = `baocao_lotrinh_euler_${timeStr}.csv`; 
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ===== SHORTCUTS PANEL TOGGLE (simulation-area button) =====
  const shortcutsBtn = $('fs-shortcuts-btn');
  const shortcutsPanel = $('fs-shortcuts-panel');
  if (shortcutsBtn) {
    shortcutsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      shortcutsPanel.style.display = shortcutsPanel.style.display === 'none' ? 'block' : 'none';
    });
  }
  document.addEventListener('click', (e) => {
    if (shortcutsPanel && !shortcutsPanel.contains(e.target) && e.target !== shortcutsBtn)
      shortcutsPanel.style.display = 'none';
  });

  // ===== KEYBOARD SHORTCUTS =====
  document.addEventListener('keydown', (e) => {
    // Bỏ qua khi đang gõ trong input/textarea
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (state.simRunning) { state.simRunning = false; logStatus('Tạm dừng.'); }
        else if (state.route.length) { state.simRunning = true; logStatus('Xe quét đang hoạt động...'); }
        break;
      case 'r': case 'R':
        resetSimulation(); logStatus('Đã reset mô phỏng.');
        break;
      case 'Enter':
        e.preventDefault();
        onComputeRoute();
        break;
      case 'e': case 'E':
        onAnalyze();
        break;
      case 'i': case 'I':
        openDetailsModal();
        break;
      case 'm': case 'M':
        switchViewMode(state.viewMode === 'abstract' ? 'map' : 'abstract');
        break;
      case 'f': case 'F':
        $('fullscreen-btn').click();
        break;
      case '+': case '=':
        $('zoom-in-btn').click();
        break;
      case '-':
        $('zoom-out-btn').click();
        break;
      case '0':
        $('zoom-reset-btn').click();
        break;
      case 'Escape':
        elements.detailsModal.style.display = 'none';
        shortcutsPanel.style.display = 'none';
        if (document.fullscreenElement) document.exitFullscreen();
        break;
    }
  });

  refreshUI(); 
  switchViewMode('abstract'); // default
  requestAnimationFrame(animate);
}

window.addEventListener("DOMContentLoaded", init);
