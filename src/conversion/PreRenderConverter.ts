import { type RhythmNode, type Note, type Tuplet, type PreRenderModel, RhythmType, type ValidDuration } from "../data/models";
import Fraction from "../helpers/fraction";

/**
 * Options exposed to the user. All optional.
 */
interface PreRenderConverterOptions{
    maxTied?: number;
}
/**
 * Full settings used internally for rendering.
 */
interface PreRenderConverterSettings{
    maxTied: number;
}

const defaultSettings: PreRenderConverterSettings = {
    maxTied: 3,
}
/**
 * Acts as intermediary converter between tree and Vexflow.
 * Handles all the fancy math and such so the VexflowConverter can focus on rendering
 */
export default class PreRenderConverter {        
    validDurations: ValidDuration[] = [1, 2, 4, 8, 16, 32, 64, 128, 256];
    settings: PreRenderConverterSettings;

    constructor(settings: PreRenderConverterOptions = {}){
        this.settings = {...defaultSettings, ...settings}
    }

    /**
     * Public method to convert a rhythm tree to PreRenderModel
     * @param meter Meter of the given bar
     * @param rootNode Root of the rhythm tree
     * @returns Array containing elements that are to be passed to the VexflowConverter
     */
    convertTreeToPreRender(meter: Fraction, rootNode: RhythmNode): PreRenderModel[]{
        // simplifies denominator down to 4, 8, 16, 32 etc
       const adjustedDenom = this.convertDenominatorToValidDuration(meter.denominator)
       const adjustedMeter = new Fraction(meter.numerator, adjustedDenom)
        const nodes = this.convertNode(rootNode, adjustedMeter)
        this.addSuffix(nodes);
        return nodes
    }

    /**
     * General method that determines if a node will be converted to a note, tuplet, or to just
     * render its children (or children's children etc) as notes
     * @param node node that is to be converted
     * @param containingSpace duration of this node. The easiest way to think of this is at the top level,
     * its the full meter (5/4 etc). Every level below that is some subset of that.
     * @returns All the prerendermodels that will need to be rendered to represent this node. It is an array to 
     * handle cases where note renders multiple notes that are tied etc
     */
    private convertNode(node: RhythmNode, containingSpace: Fraction):PreRenderModel[]{
        if (node.children.length == 0){
            return this.convertToNote(node, containingSpace)
        }
        
        const childrenSize = getChildrenTotalSize(node.children);
        //gives child unit size
        const childDuration = containingSpace.divide(childrenSize).reduce();

        // checks numerator to make sure that 50 tied notes do not happen and it stays managable looking
        if (this.isValidDuration(childDuration.denominator) && childDuration.numerator <= this.settings.maxTied){
           return this.convertNodeArray(node.children, childDuration)
        }
               
        return [this.convertToTuplet(node, containingSpace)]
    }

    private convertToNote(node: RhythmNode, containingSpace: Fraction): Note[]{
        if (node.children.length > 0){
            throw new Error("convert to node called on node that has children")
        }

        const noteThatGetsValue = containingSpace.denominator

        if (containingSpace.numerator % 1 != 0){
            throw new Error("This is were i will add handling for when the space needs x2 for weird size stuff")
        }

        if (!this.isValidDuration(noteThatGetsValue)){
            throw new Error(`tried to create note with duration 1/${noteThatGetsValue} for node ${node}`)
        }

        // TODO: add logic here later to simplify to a single node etc
        if (containingSpace.numerator > 1){
            return this.createTiedNote(node, containingSpace.numerator, noteThatGetsValue)
        }
        return [{id: node.id, kind:RhythmType.Note, duration: noteThatGetsValue, isRest: node.isRest, isAccented: node.isAccented, beamID: node.beamID}]

        }
    
    private createTiedNote(node: RhythmNode, size: number, durationValue: ValidDuration): Note[]{
        const tiedNotes: Note[] = []

        if (node.isRest){
            // no need to tie notes if node is a rest. Just make proper number of notes
            for (let i = 0; i < size; i++){
                const newNote: Note = {id: node.id, kind: RhythmType.Note, duration: durationValue, isTied: false, isRest: true, beamID: node.beamID}
                tiedNotes.push(newNote) 
            }
            return tiedNotes
        }
        // If node is not a rest, beam all notes to next except the last
        for (let i = 0; i < size - 1; i++){
            // mark the first note as accented if needed
            if (i == 0 && node.isAccented == true){
                const newAccentedNote: Note = {id: node.id, kind: RhythmType.Note, duration: durationValue, isTied: true, isAccented: true, beamID: node.beamID}
                tiedNotes.push(newAccentedNote)
            } else {
                const newNote: Note = {id: node.id, kind: RhythmType.Note, duration: durationValue, isTied: true, beamID: node.beamID}
                tiedNotes.push(newNote)    
            }
        }
        // add non-tied last note
        const lastNote: Note = {id: node.id, kind: RhythmType.Note, duration: durationValue, isTied: false, beamID: node.beamID}
        tiedNotes.push(lastNote)
        return tiedNotes
    }

    private convertNodeArray(nodes: RhythmNode[], childDuration: Fraction){
        const children: PreRenderModel[] = []
        for (const node of nodes){ 
            //duration of the node scaled by node size
            const currentDuration = childDuration.multiply(node.size)
            const converted = this.convertNode(node, currentDuration)
            children.push(...converted)
        } 
        //used since convertNode returns PreRenderModel[] so at this point children is PreRenderModel[][]
        return children.flat()
    }

    private convertToTuplet(node: RhythmNode, containingSpace: Fraction): Tuplet{
        const numNotes = getChildrenTotalSize(node.children);

        const childSize: Fraction = new Fraction(1, containingSpace.denominator)
        const notesOccupied = containingSpace.numerator

       const children = this.convertNodeArray(node.children, childSize)

        return {id: node.id, kind: RhythmType.Tuplet, children: [...children], numNotes: numNotes, notesOccupied: notesOccupied}
    }

    /**
     * Not super useful at the moment until VexFlow is bumped to 5.1.0. Allows for knowing what suffix should be used for tuplets
     * @param models children of tuplet for calculations
     */
    private addSuffix(models: PreRenderModel[]) {
        for (const model of models) {
            if (model.kind !== RhythmType.Tuplet) continue;

            if (!model.children || model.children.length === 0) {
            throw new Error(`Tuplet ${model.id} has no children; cannot calculate suffix.`);
            }

            if (model.numNotes === 0) {
            throw new Error(`Tuplet ${model.id} has 0 notes; invalid.`);
            }

            const totalDuration = new Fraction(0, 1);

            for (const child of model.children) {
            if (child.kind === RhythmType.Note) {
                const childFraction = new Fraction(1, child.duration);
                totalDuration.add(childFraction);
            }

            if (child.kind === RhythmType.Tuplet) {
                this.addSuffix([child]);

                if (child.suffix === 0 || child.suffix == null) {
                throw new Error(`suffix not created correctly for tuplet ${child.id}`);
                }
                // notes occupied is the "real" duration so needed for proper size calcs
                const childFraction = new Fraction(child.notesOccupied, child.suffix);
                totalDuration.add(childFraction);
            }
            }

            const unitSize = totalDuration.divide(model.numNotes).reduce();

            if (unitSize.numerator !== 1) {
            console.warn(`Non-unit fraction encountered in ${model.id}: ${unitSize.toString()}`);
            }

            model.suffix = unitSize.denominator;
        }
    }

    /**
     * Public helper function for converting denominators to durations that can be
     * easily rendered. The break points were decided by looking at various scores, 
     * talking to musicians, and the writer's judgement
     * @param denominator denominator to convert. Can be any number
     * @returns A proper valid duration
     */
    convertDenominatorToValidDuration(denominator: number): ValidDuration{
        // whole note
        if(denominator == 1){
            return 1
        }
        // half note
        if(denominator == 2 || denominator == 3){
            return 2
        }
        // quarter note
        if (denominator >= 4 && denominator < 8){
            return 4
        }
        // eigth note
        if (denominator >= 8 && denominator < 13){
            return 8
        }
        // 16th
        if (denominator >= 13 && denominator < 25){
            return 16
        }
        // 32nd
        if (denominator >= 25 && denominator < 55){
            return 32
        }
        // 64th
        if (denominator >= 55 && denominator < 115){
            return 64
        }
        // 128th
        if (denominator >= 115 && denominator < 240){
            return 128
        } 
        else {
            // 256th
            return 256
        }
    }

    private isValidDuration(duration: number): duration is ValidDuration {
        return this.validDurations.includes(duration as ValidDuration);
      }
}

function getChildrenTotalSize(children: RhythmNode[]): number{
    const lengths = children.map((node) => node.size)
    const sum = lengths.reduce((partialSum, a) => partialSum + a, 0)
    return sum
}