import { type RhythmNode, type Note, type Tuplet, type PreRenderModel, RhythmType, type ValidDuration } from "../data/models";
import Fraction from "../helpers/fraction";

const MAX_TIED = 3

export default class PreRenderConverter {        
    validDurations: ValidDuration[] = [1, 2, 4, 8, 16, 32, 64, 128, 256];

    /**
     * Public method to convert a rhythm tree generated in swift to prerendering json model
     * @param meter Meter of the given bar.
     * @param rootNode Root of the rhythm tree
     * @returns Array containing elements that are to be passed to the VexflowConverter for rendering
     */
    convertTreeToPreRender(meter: Fraction, rootNode: RhythmNode): PreRenderModel[]{
        // simplifies denominator down to 4, 8, 16, 32 etc
       const adjustedDenom = this.convertDenominatorToValidDuration(meter.denominator)
       const adjustedMeter = new Fraction(meter.numerator, adjustedDenom)
        const nodes = this.convertNode(rootNode, adjustedMeter)
        this.addSuffix(nodes);
        // this.beamSequence(nodes)
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
        //gives the size of what a single child of the node should be
        const childDuration = containingSpace.divide(childrenSize).reduce();

        // checks numerator to make sure that 50 tied notes do not happen and it stays managable looking
        // TODO: also add check that 
        if (this.isValidDuration(childDuration.denominator) && childDuration.numerator <= MAX_TIED){ // add second check here 
           return this.convertNodeArray(node.children, childDuration)
        }
               
        return [this.convertToTuplet(node, containingSpace)]

    }

/**
 * 
 * @param nodeToConvert Node that has no children
 * @param containingSpace Same as in convertNode. Functions as length. numerator: how many of 1/denom.
 * @returns 
 */
    private convertToNote(nodeToConvert: RhythmNode, containingSpace: Fraction): Note[]{
        if (nodeToConvert.children.length > 0){
            throw new Error("convert to node called on node that has children")
        }

        const noteThatGetsValue = containingSpace.denominator

        if (containingSpace.numerator % 1 != 0){
            throw new Error("This is were i will add handling for when the space needs x2 for weird size stuff")
        }

        if (!this.isValidDuration(noteThatGetsValue)){
            throw new Error(`tried to create note with duration 1/${noteThatGetsValue} for node ${nodeToConvert}`)
        }

        //creates tied notes if notes are larger than 1. could add logic here later to simplify to a single node etc
        if (containingSpace.numerator > 1){
            return this.createTiedNote(nodeToConvert.id, containingSpace.numerator, noteThatGetsValue, nodeToConvert.isRest, nodeToConvert.isAccented, nodeToConvert.beamID)
        }
        return [{id: nodeToConvert.id, kind:RhythmType.Note, duration: noteThatGetsValue, isRest: nodeToConvert.isRest, isAccented: nodeToConvert.isAccented, beamID: nodeToConvert.beamID}]

        }
        /**
 * 
 * @param nodeToConvert Node that has no children
 * @param containingSpace Same as in convertNode. Functions as length. numerator: how many of 1/denom.
 * @returns 
 */
    private convertEmptyRootNode(nodeToConvert: RhythmNode, containingSpace: Fraction): PreRenderModel[] {
        if (nodeToConvert.children.length > 0) {
            throw new Error("Root node has children. convertEmptyRootNode should not have been called.");
        }
    
        const noteValue = containingSpace.denominator;
    
        if (containingSpace.numerator % 1 !== 0) {
            throw new Error("Handling for fractional subdivisions is not implemented yet.");
        }
    
        if (!this.isValidDuration(noteValue)) {
            throw new Error(`Invalid note duration 1/${noteValue} for node ${nodeToConvert.id}`);
        }
    
        // Case 1: Single note, no ties needed.
        if (containingSpace.numerator === 1) {
            return [{
                id: nodeToConvert.id,
                kind: RhythmType.Note,
                duration: noteValue,
                isRest: nodeToConvert.isRest,
                isAccented: nodeToConvert.isAccented,
                isTied: false,
                beamID: nodeToConvert.beamID
            }];
        }
        // const simplified = containingSpace.numerator / containingSpace.denominator
        // if simplified idk
    
        // Case 2: Multiple notes but within tie limit.
        if (containingSpace.numerator <= MAX_TIED) {
            return this.createTiedNote(
                nodeToConvert.id,
                containingSpace.numerator,
                noteValue,
                nodeToConvert.isRest,
                nodeToConvert.isAccented,
                nodeToConvert.beamID
            );
        }
    
        // Case 3: Exceeds the max tied limit - handle with a tuplet.
        // Ensure that you pass the appropriate duration (i.e., containingSpace) if needed.
        // Optionally, you might want to flatten the tuplet result if your rendering expects notes.
        return this.convertToTuplet(nodeToConvert, containingSpace).children as Note[];
    }
    

    // helper function for convertToNote TODO: fix rest stuff in this
    private createTiedNote(id:string, size: number, durationValue: ValidDuration, isRest: boolean, isAccented: boolean, beamID: string | null): Note[]{
        const tiedNotes: Note[] = []

        if (isRest){
            // make all the notes but don't need to worry about tieiinging
            for (let i = 0; i < size; i++){
                const newNote: Note = {id, kind: RhythmType.Note, duration: durationValue, isTied: false, isRest: true, beamID}
                tiedNotes.push(newNote) 
            }
            return tiedNotes
        }
        // beam all notes to next except the last if is not a rest
        for (let i = 0; i < size - 1; i++){
            // mark the first note as accented if needed
            if (i == 0 && isAccented == true){
                const newAccentedNote: Note = {id, kind: RhythmType.Note, duration: durationValue, isTied: true, isAccented: true, beamID}
                tiedNotes.push(newAccentedNote)
            } else {
                const newNote: Note = {id, kind: RhythmType.Note, duration: durationValue, isTied: true, beamID}
                tiedNotes.push(newNote)    
            }
        }
        // add no tie on the last note
        const lastNote: Note = {id, kind: RhythmType.Note, duration: durationValue, isTied: false, beamID}
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

    // there should be some control potentially here for people to be able to chose how they want it notated
    // example: change from 3:4 quarters to 3:8 eighths -> 3:16 sixteenths etc. 
    private convertToTuplet(node: RhythmNode, containingSpace: Fraction): Tuplet{
        // number children
        const numNotes = getChildrenTotalSize(node.children);

        const childSize: Fraction = new Fraction(1, containingSpace.denominator)
        const notesOccupied = containingSpace.numerator

       const children = this.convertNodeArray(node.children, childSize)

        // to have note beside -> baseDuration -> childSize
        return {id: node.id, kind: RhythmType.Tuplet, children: [...children], numNotes: numNotes, notesOccupied: notesOccupied}
    }

    // post processing step to add beams to everything
    private beamSequence(sequence: PreRenderModel[]){
        for (const element of sequence){
            switch (element.kind) {
                case RhythmType.Note:
                 // return this.renderNote(model);
                // eslint-disable-next-line no-fallthrough
                case RhythmType.Tuplet:
                //  return this.renderTuplet(model);
              }
          
        }
    }

    private isValidDuration(duration: number): duration is ValidDuration {
        return this.validDurations.includes(duration as ValidDuration);
      }

    private findClosestSmallerValidDuration(duration: number): ValidDuration{
    const i = 0;

    while (this.validDurations[i] < duration){
        return 2
    }
    return 2
    }

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

            // improper size? this may be enough
            const unitSize = totalDuration.divide(model.numNotes).reduce();

            if (unitSize.numerator !== 1) {
            console.warn(`Non-unit fraction encountered in ${model.id}: ${unitSize.toString()}`);
            }

            model.suffix = unitSize.denominator;
        }
    }

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
        // 128
        if (denominator >= 115 && denominator < 240){
            return 128
        } 
        else {
            return 256
        }


        //256

        // 25 -> 50 all 32
    }
}

// for the moment just use uuid whenever making a new note
function getChildrenTotalSize(children: RhythmNode[]): number{
    const lengths = children.map((node) => node.size)
    const sum = lengths.reduce((partialSum, a) => partialSum + a, 0)
    return sum
}