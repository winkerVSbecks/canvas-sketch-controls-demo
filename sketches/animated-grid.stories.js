import canvasSketch from 'canvas-sketch';
import { lerp } from 'canvas-sketch-util/math';

export default {
  title: 'Sketches/Animated Grid',
  argTypes: {
    gridSize: { control: { type: 'range', min: 2, max: 10, step: 1 } },
    padding: { control: { type: 'range', min: 0, max: 1, step: 0.1 } },
    thickness: { control: { type: 'range', min: 0.1, max: 1, step: 0.1 } },
  },
};

export const Sketch = ({ gridSize, padding, thickness }) => {
  const canvas = document.createElement('canvas');

  if (manager) {
    manager.unload();
  }

  canvasSketch(animatedGridSketch, {
    duration: 3,
    dimensions: [640, 640],
    scaleToView: true,
    playbackRate: 'throttle',
    animate: true,
    fps: 24,
    canvas,
    gridSize,
    padding,
    thickness,
  }).then((m) => {
    manager = m;
  });

  return canvas;
};

Sketch.args = {
  gridSize: 7,
  padding: 0.1,
  thickness: 0.1,
};

function animatedGridSketch() {
  return ({ context, width, height, playhead, settings }) => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);

    const gridSize = settings.gridSize; // 7;
    const padding = width * settings.padding; // 0.2;
    const tileSize = (width - padding * 2) / gridSize;

    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        // get a 0..1 UV coordinate
        const u = gridSize <= 1 ? 0.5 : x / (gridSize - 1);
        const v = gridSize <= 1 ? 0.5 : y / (gridSize - 1);

        // scale to dimensions with a border padding
        const tx = lerp(padding, width - padding, u);
        const ty = lerp(padding, height - padding, v);

        // here we get a 't' value between 0..1 that
        // shifts subtly across the UV coordinates
        const offset = u * 0.2 + v * 0.1;
        const t = (playhead + offset) % 1;

        // now we get a value that varies from 0..1 and back
        let mod = Math.sin(t * Math.PI);

        // we make it 'ease' a bit more dramatically with exponential
        mod = Math.pow(mod, 3);

        // now choose a length, thickness and initial rotation
        const length = tileSize * 0.65;
        const thickness = tileSize * settings.thickness; // 0.1;
        const initialRotation = Math.PI / 2;

        // And rotate each line a bit by our modifier
        const rotation = initialRotation + mod * Math.PI;

        // Now render...
        draw(context, tx, ty, length, thickness, rotation);
      }
    }
  };

  function draw(context, x, y, length, thickness, rotation) {
    context.save();
    context.fillStyle = 'black';

    // Rotate in place
    context.translate(x, y);
    context.rotate(rotation);
    context.translate(-x, -y);

    // Draw the line
    context.fillRect(x - length / 2, y - thickness / 2, length, thickness);
    context.restore();
  }
}
