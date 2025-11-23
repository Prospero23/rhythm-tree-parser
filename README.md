# Rhythm Tree Converter

Convert complex, hierarchical rhythm-tree structures into VexFlow-friendly notes, ready to render on a stave.

This is an open-source version of the pipeline used inside [ORhythmic](https://apps.apple.com/us/app/orhythmic/id6742388100).

## Installation
If your project uses a bundler, you can install rhythm-tree-converter along with VexFlow from npm:
```bash
npm install vexflow @orhythmic/rhythm-tree-converter
```

## How to Use
Below is a basic flow for the conversion process. For more complex rendering help, see [the VexFlow wiki](https://github.com/0xfe/vexflow/wiki).
```js
import { treeToVexflow } from "@orhythmic/rhythm-tree-converter";
import { Factory } from "vexflow";

const factory = new Factory({renderer: {elementId: "output", width: 500, height: 200}});
const meter = [4,4];

const note = {
    id: "0",
    size: 1,
    children: [],
    isRest: false,
    isAccented: false,
    beamID: null
}

const {notes, validMeterString} = treeToVexflow(factory, note, meter)

const voice = factory.Voice({time: validMeterString})
voice.addTickables(notes);

const system = factory.System({width: 500});
system.addStave({ voices: [voice] });

factory.draw()
```

## What conversion returns
```ts
{
    notes: StemmableNote[]; // Notes to be rendered by VexFlow
    validMeterString: string; // Meter but with normalized denominator (1 ,2, 4, 8, etc.)
    vexToTree: Record<string, string[]>; // Map to get RhythmNode ID for given VexFlow ID.
    treeToVex: Record<string, string>; // Map to get VexFlow IDs for given RhythmNode ID.
}
```
