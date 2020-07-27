import canvasSketch from 'canvas-sketch';
import { linspace, lerpArray } from 'canvas-sketch-util/math';
import Random from 'canvas-sketch-util/random';
import RBush from 'rbush';
import knn from 'rbush-knn';
import inside from 'point-in-polygon';

export default {
  title: 'Sketches/Differential Growth',
  argTypes: {
    repulsionForce: { control: { type: 'range', min: 0, max: 1, step: 0.1 } },
    attractionForce: { control: { type: 'range', min: 0, max: 1, step: 0.1 } },
    alignmentForce: { control: { type: 'range', min: 0, max: 1, step: 0.1 } },
    brownianMotionRange: {
      control: { type: 'range', min: 0, max: 0.1, step: 0.001 },
    },
    leastMinDistance: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
    repulsionRadius: { control: { type: 'range', min: 0, max: 1, step: 0.1 } },
    maxDistance: { control: { type: 'range', min: 0, max: 1, step: 0.125 } },
    boundsSideCount: { control: { type: 'range', min: 0, max: 12, step: 1 } },
  },
};

let manager;

export const Sketch = (args) => {
  const canvas = document.createElement('canvas');

  if (manager) {
    manager.unload();
  }

  canvasSketch(differentialGrowthSketch, {
    suffix: Random.getSeed(),
    scaleToView: true,
    animate: true,
    dimensions: [800 * 2, 600 * 2],
    canvas,
    ...args,
  }).then((m) => {
    manager = m;
  });

  return canvas;
};

Sketch.args = {
  repulsionForce: 0.5,
  attractionForce: 0.5,
  alignmentForce: 0.35,
  brownianMotionRange: 0.005,
  leastMinDistance: 0.03,
  repulsionRadius: 0.125,
  maxDistance: 0.1,
  boundsSideCount: 5,
};

function differentialGrowthSketch(props) {
  const { width, height, settings } = props;
  const foreground = '#F15060';
  const background = '#efedf6';

  const tree = new XYRBush();
  const scale = 12;
  const forceMultiplier = 0.5;
  const repulsionForce = settings.repulsionForce * forceMultiplier;
  const attractionForce = settings.attractionForce * forceMultiplier;
  const alignmentForce = settings.alignmentForce * forceMultiplier;
  const brownianMotionRange = (width * settings.brownianMotionRange) / scale;
  const leastMinDistance = (width * settings.leastMinDistance) / scale;
  const repulsionRadius = (width * settings.repulsionRadius) / scale;
  const maxDistance = (width * settings.maxDistance) / scale;

  let path;
  const bounds = createLine(
    settings.boundsSideCount,
    width / 2,
    height / 2,
    width / 4
  );

  return {
    begin() {
      path = createLine(6, width / 2, height / 2, width / 12);
      tree.clear();
      tree.load(path);
    },
    render({ context }) {
      iterate(tree, path, bounds, [width / 2, height / 2]);

      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.fillStyle = foreground;
      context.lineWidth = 12;
      context.lineJoin = 'round';
      context.beginPath();

      path.forEach(([x, y], idx) => {
        if (idx === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.closePath();
      context.fill();

      context.strokeStyle = foreground;
      context.beginPath();
      bounds.forEach(([x, y], idx) => {
        if (idx === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.closePath();
      context.stroke();
    },
  };

  /**
   *
   * https://adrianton3.github.io/blog/art/differential-growth/differential-growth
   * https://medium.com/@jason.webb/2d-differential-growth-in-js-1843fd51b0ce
   * https://inconvergent.net/2016/shepherding-random-growth
   *
   * 1. Each node wants to be close to it’s connected neighbour nodes and
   *    will experience a mutual attraction force to them.
   *
   * 2. Each node wants to maintain a minimum distance from all nearby nodes,
   *    connected or not, and will experience a mutual repulsion force from them.
   *
   * 3. Each node wants to rest exactly halfway between it’s connected neighbour
   *    nodes on as straight of a line as possible and will experience an alignment
   *    force towards the midpoint.
   *
   *
   * 1. Nodes and Edges: nodes are connected to a certain number of neighbouring nodes through edges.
   *
   * 2. Attraction: connected nodes will try to maintain a reasonably close proximity to each other.
   *    In the figure below attraction happens between connected nodes in the loop.
   *
   * 3. Rejection: nodes will try to avoid being too close to surrounding nodes (within a certain distance).
   *    Rejection forces are indicated by cyan lines in the figure below.
   *
   * 4. Splits: If an edges gets too long, a new node will be injected at the middle of the edge.
   *
   * 5. Growth: in addition to the splits, new nodes are injected according to some growth scheme.
   *
   */

  function createLine(count, x, y, r) {
    const offset = -Math.PI / 2;
    return linspace(count).map((idx) => [
      x + r * Math.cos(offset + Math.PI * 2 * idx),
      y + r * Math.sin(offset + Math.PI * 2 * idx),
    ]);
  }

  function iterate(tree, nodes, bounds, centre) {
    tree.clear();
    // Generate tree from path nodes
    tree.load(nodes);

    for (let [idx, node] of nodes.entries()) {
      applyBrownianMotion(node);
      applyRepulsion(idx, nodes, tree);
      applyAttraction(idx, nodes);
      applyAlignment(idx, nodes);
      keepInBounds(idx, nodes, bounds, centre);
    }

    splitEdges(nodes);
    pruneNodes(nodes);
  }

  function applyBrownianMotion(node) {
    node[0] += Random.range(-brownianMotionRange / 2, brownianMotionRange / 2);
    node[1] += Random.range(-brownianMotionRange / 2, brownianMotionRange / 2);
  }

  function applyRepulsion(idx, nodes, tree) {
    const node = nodes[idx];
    // Perform knn search to find all neighbours within certain radius
    const neighbours = knn(
      tree,
      node[0],
      node[1],
      undefined,
      undefined,
      repulsionRadius
    );

    // Move this node away from all nearby neighbours
    neighbours.forEach((neighbour) => {
      const d = distance(neighbour, node);
      nodes[idx] = lerpArray(
        node,
        neighbour,
        -repulsionForce
        // (-repulsionForce * d) / repulsionRadius
      );
    });
  }

  /**
   *
   *                *
   *                ^
   *                |
   *                |
   *   * ⟍         |             ⟋ *
   *    B  ⟍       |          ⟋  C
   *         ⟍     |       ⟋
   *           ⟍   |    ⟋
   *             ⟍ | ⟋
   *                *
   *                A
   */
  function applyAttraction(index, nodes) {
    const node = nodes[index];
    const connectedNodes = getConnectedNodes(index, nodes);

    Object.values(connectedNodes).forEach((neighbour) => {
      const d = distance(node, neighbour);

      if (d > leastMinDistance) {
        nodes[index] = lerpArray(node, neighbour, attractionForce);
      }
    });
  }

  /**
   *
   *   * ⟍---------*-------------⟋ *
   *    B  ⟍       ^          ⟋  C
   *         ⟍     |       ⟋
   *           ⟍   |    ⟋
   *             ⟍ | ⟋
   *                *
   *                A
   */
  function applyAlignment(index, nodes) {
    const node = nodes[index];
    const { previousNode, nextNode } = getConnectedNodes(index, nodes);

    if (!previousNode || !nextNode) {
      return;
    }

    // Find the midpoint between the neighbours of this node
    const midpoint = getMidpoint(previousNode, nextNode);

    // Move this point towards this midpoint
    nodes[index] = lerpArray(node, midpoint, alignmentForce);
  }

  function keepInBounds(idx, nodes, bounds, centre) {
    const node = nodes[idx];
    const inBounds = inside(node, bounds);

    if (!inBounds) {
      nodes[idx] = lerpArray(node, centre, 0.01);
    }
  }

  function splitEdges(nodes) {
    for (let [idx, node] of nodes.entries()) {
      const { previousNode } = getConnectedNodes(idx, nodes);

      if (previousNode === undefined) {
        break;
      }

      if (distance(node, previousNode) >= maxDistance) {
        const midpoint = getMidpoint(node, previousNode);

        // Inject the new midpoint into the global list
        if (idx == 0) {
          nodes.splice(nodes.length, 0, midpoint);
        } else {
          nodes.splice(idx, 0, midpoint);
        }
      }
    }
  }

  function pruneNodes(nodes) {
    for (let [index, node] of nodes.entries()) {
      const { previousNode } = getConnectedNodes(index, nodes);

      if (
        previousNode !== undefined &&
        distance(node, previousNode) < leastMinDistance
      ) {
        if (index == 0) {
          nodes.splice(nodes.length - 1, 1);
        } else {
          nodes.splice(index - 1, 1);
        }
      }
    }
  }

  function getConnectedNodes(index, nodes, isClosed = true) {
    let previousNode, nextNode;

    if (index == 0 && isClosed) {
      previousNode = nodes[nodes.length - 1];
    } else if (index >= 1) {
      previousNode = nodes[index - 1];
    }

    if (index == nodes.length - 1 && isClosed) {
      nextNode = nodes[0];
    } else if (index <= nodes.length - 1) {
      nextNode = nodes[index + 1];
    }

    return { previousNode, nextNode };
  }

  function distance(v1, v2) {
    const dx = v2[0] - v1[0];
    const dy = v2[1] - v1[1];
    return Math.hypot(dx, dy);
  }

  function getMidpoint(a, b) {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
}

class XYRBush extends RBush {
  toBBox([x, y]) {
    return { minX: x, minY: y, maxX: x, maxY: y };
  }
  compareMinX(a, b) {
    return a.x - b.x;
  }
  compareMinY(a, b) {
    return a.y - b.y;
  }
}
