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

export function treeToVexflow(vexflowFactory: Factory, rootNode: RhythmNode, meter: Fraction): ConversionResult{
    const preConverter = new PreRenderConverter();
    const vexConverter = new VexflowConverter(vexflowFactory);

    const nodes = preConverter.convertTreeToPreRender(meter, rootNode);    
    const notes = vexConverter.processNodes(nodes);

    const validDenominator = preConverter.convertDenominatorToValidDuration(meter.denominator);
    const validMeter = new Fraction(meter.numerator, validDenominator);

    const vexToTree = vexConverter.getVex2EngineMap();
    const treeToVex = vexConverter.getEngine2VexMap();

    return {
        notes,
        validMeterString: validMeter.toString(),
        vexToTree,
        treeToVex
    }
}