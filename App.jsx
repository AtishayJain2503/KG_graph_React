import { useEffect, useState, useCallback, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import "./App.css";

export default function App() {
  const fgRef = useRef();
  const miniMapRef = useRef();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [fullData, setFullData] = useState(null);
  const [filteredData, setFilteredData] = useState(null);
  const [minComponentSize, setMinComponentSize] = useState(1);

  const getNodeColor = (node) => highlightNodes.has(node.id) ? "#2a4d6f" : node.originalColor;
  const getLinkColor = (link) => highlightLinks.has(link) ? "#2a4d6f" : link.originalColor;

  useEffect(() => {
    fetch("./graph.json")
      .then((res) => res.json())
      .then((json) => {
        json.nodes.forEach(node => {
          node.originalColor = "#4682B4";
          node.color = "#4682B4";
        });
        json.links.forEach(link => {
          link.originalColor = "#cce5f6";
          link.color = "#cce5f6";
        });
        setFullData(json);
      })
      .catch((err) => console.error("Failed to load graph", err));
  }, []);

  function getConnectedComponents(nodes, links) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visited = new Set();
    const components = [];

    const dfs = (nodeId, group) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      group.push(nodeMap.get(nodeId));
      links.forEach(link => {
        const src = typeof link.source === "object" ? link.source.id : link.source;
        const tgt = typeof link.target === "object" ? link.target.id : link.target;
        if (src === nodeId && !visited.has(tgt)) dfs(tgt, group);
        else if (tgt === nodeId && !visited.has(src)) dfs(src, group);
      });
    };

    for (let node of nodes) {
      if (!visited.has(node.id)) {
        const group = [];
        dfs(node.id, group);
        components.push(group);
      }
    }

    return components;
  }

  useEffect(() => {
    if (!fullData) return;

    const components = getConnectedComponents(fullData.nodes, fullData.links);
    const filteredNodes = [];
    const filteredLinks = [];
    const nodeSet = new Set();

    components.forEach(group => {
      if (group.length >= minComponentSize) {
        group.forEach(n => {
          filteredNodes.push(n);
          nodeSet.add(n.id);
        });
      }
    });

    fullData.links.forEach(link => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (nodeSet.has(src) && nodeSet.has(tgt)) {
        filteredLinks.push(link);
      }
    });

    setFilteredData({ nodes: filteredNodes, links: filteredLinks });
    setData({ nodes: filteredNodes, links: filteredLinks });
  }, [fullData, minComponentSize]);

  useEffect(() => {
    let animationFrameId;
    const drawMiniMap = () => {
      if (!data || !fgRef.current || !miniMapRef.current) {
        animationFrameId = requestAnimationFrame(drawMiniMap);
        return;
      }
      const ctx = miniMapRef.current.getContext("2d");
      if (!ctx) return;

      const width = miniMapRef.current.width = 200;
      const height = miniMapRef.current.height = 200;

      ctx.clearRect(0, 0, width, height);

      const nodesWithCoords = data.nodes.filter(n => typeof n.x === "number" && typeof n.y === "number");
      if (nodesWithCoords.length === 0) {
        animationFrameId = requestAnimationFrame(drawMiniMap);
        return;
      }

      const xs = nodesWithCoords.map(n => n.x);
      const ys = nodesWithCoords.map(n => n.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const graphW = maxX - minX || 1, graphH = maxY - minY || 1;

      nodesWithCoords.forEach(n => {
        const x = ((n.x - minX) / graphW) * width;
        const y = ((n.y - minY) / graphH) * height;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = "#4682B4";
        ctx.fill();
      });

      const camera = fgRef.current.cameraPosition();
      const zoom = fgRef.current.zoom();
      const cx = ((camera.x - minX) / graphW) * width;
      const cy = ((camera.y - minY) / graphH) * height;
      const viewW = width / zoom;
      const viewH = height / zoom;

      ctx.strokeStyle = "red";
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - viewW / 2, cy - viewH / 2, viewW, viewH);

      animationFrameId = requestAnimationFrame(drawMiniMap);
    };
    animationFrameId = requestAnimationFrame(drawMiniMap);
    return () => cancelAnimationFrame(animationFrameId);
  }, [data]);

  const handleNodeClick = useCallback((node) => {
    const neighbors = new Set();
    const links = new Set();
    const neighborData = [];
    data.links.forEach((link) => {
      const sourceId = typeof link.source === "object" ? link.source.id : link.source;
      const targetId = typeof link.target === "object" ? link.target.id : link.target;
      const isNeighbor = sourceId === node.id || targetId === node.id;
      if (isNeighbor) {
        neighbors.add(sourceId);
        neighbors.add(targetId);
        links.add(link);
        const otherNodeId = sourceId === node.id ? targetId : sourceId;
        const otherNode = data.nodes.find(n => n.id === otherNodeId);
        if (otherNode) neighborData.push({ id: otherNode.id, name: otherNode.name || otherNode.label || otherNode.id, relation: link.label || "–" });
      }
    });
    neighbors.delete(node.id);
    setHighlightNodes(new Set([...neighbors, node.id]));
    setHighlightLinks(links);
    setSelected({ type: "node", data: node, neighbors: neighborData });
  }, [data]);

  const handleLinkClick = useCallback((link) => {
    setSelected({ type: "link", data: link });
  }, []);

  const handleSearch = useCallback((term) => {
    if (!data) return;
    const node = data.nodes.find((n) => n.id.toLowerCase() === term.toLowerCase());
    if (node) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(4, 1000);
      setSelected({ type: "node", data: node });
    } else alert("Node not found!");
  }, [data]);

  const suggestions = data ? data.nodes.map((n) => n.id).filter((id) => id.toLowerCase().includes(searchTerm.toLowerCase()) && searchTerm.length > 1).slice(0, 10) : [];

  return (
    <div className="app-container">
      <div className="top-controls" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div className="search-bar" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="text" placeholder="Search node..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSearch(searchTerm); }} />
          <button onClick={() => handleSearch(searchTerm)}>Go</button>
          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((s, idx) => (
                <li key={idx} onClick={() => { setSearchTerm(s); handleSearch(s); }}>{s}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="slider-bar-inline" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <label><b>Min Component Size:</b> {minComponentSize}</label>
          <input type="range" min="1" max="50" value={minComponentSize} onChange={(e) => setMinComponentSize(Number(e.target.value))} />
        </div>
      </div>

      <div className="graph-pane">
        {filteredData && filteredData.nodes.length > 0 ? (
          <ForceGraph2D ref={fgRef} style={{ width: "100%", height: "100%" }} graphData={filteredData} nodeLabel="id" linkLabel="label" linkDirectionalArrowLength={6} linkDirectionalArrowRelPos={1} linkWidth={() => 2} nodeAutoColorBy="group" onNodeClick={handleNodeClick} onLinkClick={handleLinkClick} nodeColor={getNodeColor} linkColor={getLinkColor} onNodeDrag={handleNodeClick}
            linkCanvasObjectMode={() => "after"}
            linkCanvasObject={(link, ctx, globalScale) => {
              if (globalScale < 2 || !link.label) return;
              const fontSize = Math.min(30, 12 / globalScale);
              ctx.font = `${fontSize}px Sans-Serif`;
              ctx.fillStyle = "#1a1a1a";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const start = typeof link.source === "object" ? link.source : { x: 0, y: 0 };
              const end = typeof link.target === "object" ? link.target : { x: 0, y: 0 };
              const midX = (start.x + end.x) / 2;
              const midY = (start.y + end.y) / 2;
              ctx.fillText(link.label, midX, midY);
            }}
            nodeCanvasObjectMode={() => "after"}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const label = node.id;
              const fontSize = 12 / globalScale;
              if (globalScale < 1.5) return;
              ctx.font = `bold ${fontSize}px Sans-Serif`;
              ctx.fillStyle = "black";
              ctx.fillText(label, node.x + 6, node.y + 6);
            }}
          />
        ) : (
          <p style={{ padding: "1rem", color: "#666" }}>Loading graph…</p>
        )}
        <canvas
          ref={miniMapRef}
          className="mini-map"
          style={{
            position: "absolute",
            width: "200px",
            height: "200px",
            bottom: "1rem",
            right: "1rem",
            background: "white",
            border: "1px solid #ccc",
            boxShadow: "0 0 10px rgba(0,0,0,0.1)",
            zIndex: 1000
          }}
        />

      </div>

      {selected && (
        <div className="side-pane">
          <button className="close-btn" onClick={() => setSelected(null)}>✕</button>
          <h2>{selected.type === "link" ? "Edge" : "Node"}</h2>
          {selected.type === "node" && (
            <>
              <p><strong>Name of node:</strong> {selected.data?.name ?? selected.data?.id ?? "N/A"}</p>
              {selected.neighbors?.length > 0 && (
                <div>
                  <p><strong>Connected to:</strong></p>
                  <ul>
                    {selected.neighbors.map((n, idx) => (
                      <li key={idx}>{n.name} <span style={{ color: "#888" }}>({n.relation})</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {selected.type === "link" && (
            <>
              <p><strong>Source:</strong> {typeof selected.data.source === "object" ? selected.data.source.id : selected.data.source}</p>
              <p><strong>Target:</strong> {typeof selected.data.target === "object" ? selected.data.target.id : selected.data.target}</p>
              {selected.data.label && (<p><strong>Label:</strong> {selected.data.label}</p>)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
