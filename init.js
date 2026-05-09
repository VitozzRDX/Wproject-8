import { State } from './state.js';
import { Interpreter } from './interpreter.js';
import { initRenderer } from './renderer.js';
import { PhaseManager } from './phaseManager.js';
import { Engine } from './engine.js';
import { drawGrid } from './hexgrid.js';
import { createAndLoadUnits } from './unitLoading.js';

// Слушаем клики на сцене, передаём в Interpreter
function initInput(stage) {
  stage.on('click', e => Interpreter.handle(e));

  // правый клик — отключаем браузерное меню, передаём в Interpreter
  stage.on('contextmenu', e => {
    e.evt.preventDefault();
    Interpreter.handle(e);
  });

  // клавиатурные события — через Interpreter
  window.addEventListener('keydown', e => Interpreter.handleKey(e.key));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function init() {
    const stage = new Konva.Stage({
    container: 'container',
    width:  window.innerWidth,
    height: window.innerHeight,
    });
    const backgroundLayer = new Konva.Layer();
    const unitLayer       = new Konva.Layer();
    const uiLayer = new Konva.Layer();
    const hexLayer       = new Konva.Layer();

    stage.add(backgroundLayer, unitLayer, uiLayer,hexLayer);

    const img = await loadImage('./graf/1.gif');
    backgroundLayer.add(new Konva.Image({ image: img, x: 0, y: 0, id: 'map' }));
    backgroundLayer.batchDraw();

    drawGrid(hexLayer);

    await createAndLoadUnits(unitLayer);
    unitLayer.batchDraw();

    PhaseManager.setPhase('german movement phase');

    initRenderer(); // Renderer подписывается на изменения State

    initInput(stage); // Слушаем клики на сцене, передаём в Interpreter

    Engine.init(uiLayer); // Передаём uiLayer в RendererUI, рисуем кнопки

}

init();