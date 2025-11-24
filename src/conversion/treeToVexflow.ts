import VexflowConverter, { EngineMap, RenderMap } from "./VexflowConverter";
import { Factory, StemmableNote } from "vexflow";
import { RhythmNode } from "../data/models";
import PreRenderConverter from "./PreRenderConverter";
import Fraction from "../helpers/fraction";

interface ConversionResult{
    notes: StemmableNote[];
    validMeterString: string;
    vexToTree: RenderMap;
    treeToVex: EngineMap;
}

interface ConversionSettings{
    noteName: string;
    maxTied: number;
}

interface ConversionOptions{
    noteName?: string;
    maxTied?: number;
}

const baseSettings: ConversionSettings = {
    noteName: "B/4",
    maxTied: 3
}

export function treeToVexflow(vexflowFactory: Factory, rootNode: RhythmNode, meter: [number, number], options: ConversionOptions = {}): ConversionResult{
    const settings: ConversionSettings = {...baseSettings, ...options};

    const preConverter = new PreRenderConverter({maxTied: settings.maxTied});
    const vexConverter = new VexflowConverter(vexflowFactory, {noteName: settings.noteName});

    const meterFraction = new Fraction(...meter);
    const nodes = preConverter.convertTreeToPreRender(meterFraction, rootNode);    
    const notes = vexConverter.processNodes(nodes);

    const validDenominator = preConverter.convertDenominatorToValidDuration(meterFraction.denominator);
    const validMeter = new Fraction(meterFraction.numerator, validDenominator);

    const vexToTree = vexConverter.getVex2EngineMap();
    const treeToVex = vexConverter.getEngine2VexMap();

    return {
        notes,
        validMeterString: validMeter.toString(),
        vexToTree,
        treeToVex
    }
}