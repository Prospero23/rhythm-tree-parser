import { VexFlow, StemmableNote, Factory, Registry, ModifierPosition, Articulation, type Tuplet as VexTuplet} from 'vexflow';
import {RhythmType, type PreRenderModel, type Note, type Tuplet} from './data/models';
import isValidToBeam from './helpers/isValidToBeam';

const { Glyphs } = VexFlow;

const MIDDLE_NOTE = "B/4";

// for tie stuff
export type EngineMap = Record<string, string[]>
export type RenderMap = Record<string, string>

type VexflowConverterSettings = {
  hasSuffix: boolean;
}

export default class VexflowConverter {
  private factory: Factory; 
  private registry: Registry;
  private validDurations: number[];
  private engineToRenderNotes: EngineMap
  private renderNotesToEngine: RenderMap
  private engineToRenderTies: EngineMap
  private renderTiesToEngine: RenderMap
  private settings: VexflowConverterSettings = {hasSuffix: true}

  constructor(factory: Factory, options: {hasSuffix: boolean}) {
    this.factory = factory;
    this.registry = new Registry();
    Registry.enableDefaultRegistry(this.registry) //auto adds notes to registry 
    this.validDurations = [1, 2, 4, 8, 16, 32, 64, 128, 256];
    this.engineToRenderNotes = {}
    this.renderNotesToEngine = {}
    this.engineToRenderTies = {}
    this.renderTiesToEngine = {}
    this.settings = {...options};

  }

  processNodes(nodes: PreRenderModel[]): StemmableNote[] {
    const result: StemmableNote[] = [];

    // First pass: Render and register all notes
    for (let i = 0; i < nodes.length; i++) {
      const currentNode = nodes[i];
      const renderedNotes = this.proccessNode(currentNode); // Render and register
      result.push(...renderedNotes);
    }

    // generate ties in some capacity here
    for (let engineID in this.engineToRenderNotes){
      this.generateTies(engineID)
    }

    // beam
    this.beamByGroup(result)

    return result
  }

  getEngine2VexMap(): EngineMap {
    const combinedMap: EngineMap = {};
  
    // First, add all note IDs from engineToRenderNotes.
    Object.keys(this.engineToRenderNotes).forEach(engineID => {
      // Start with a copy of the note IDs.
      combinedMap[engineID] = [...this.engineToRenderNotes[engineID]];
  
      // If there are any ties for this engine, add them.
      if (this.engineToRenderTies[engineID]) {
        combinedMap[engineID] = combinedMap[engineID].concat(this.engineToRenderTies[engineID]);
      }
    });
  
    // If there are any engineIDs that exist only in the ties map, add those as well. NOT NEEDED BUT MAYBE IN FUTURE
    // Object.keys(this.engineToRenderTies).forEach(engineID => {
    //   if (!combinedMap[engineID]) {
    //     combinedMap[engineID] = [...this.engineToRenderTies[engineID]];
    //   }
    // });
  
    return combinedMap;
  }
  
  getVex2EngineMap(): RenderMap {
    // TODO: make combined map actually work when clicking ties but for now whatever
    const combinedMap: RenderMap = {...this.renderNotesToEngine, ...this.renderTiesToEngine};
    
    
    return combinedMap
  }

  // Method to process individual nodes
  private proccessNode(model: PreRenderModel): StemmableNote[] {
    switch (model.kind) {
      case RhythmType.Note:
        return this.renderNote(model);
      case RhythmType.Tuplet:
        return this.renderTuplet(model);
    }
  }

  private renderNote(model: Note): StemmableNote[] {
    let duration = model.duration;
    if (!this.isValidDuration(duration)) {
      throw new Error(`Invalid duration: ${duration} at node ${JSON.stringify(model)}`);
    }
    return [this.createNoteWithDuration(model.duration, model.isRest, model.isAccented, model.dots, model.id, model.beamID)];
  }

  private renderTuplet(model: Tuplet): StemmableNote[] {
    const childNotes: StemmableNote[] = this.processNodes(model.children);
   // let childDuration = childNotes[0].getDuration();

    let tuplet: VexTuplet;
    if (this.settings.hasSuffix){
      if (!model.suffix){
        throw new Error("Tuplet does not have initialized suffix")
      }
      let suffixString = this.durationToString(model.suffix)
      let suffix = this.durationStringToGlyph(suffixString);
      // need at least vexflow 5.1.0 to add suffix to tuplets
      tuplet = this.factory.Tuplet({notes: childNotes, options: {numNotes: model.numNotes, notesOccupied: model.notesOccupied, ratioed: true, bracketed: true}})
    } else { 
      tuplet = this.factory.Tuplet({notes: childNotes, options: {numNotes: model.numNotes, notesOccupied: model.notesOccupied, ratioed: true}}) 
    }

    tuplet.setAttribute("id", model.id)
    tuplet.setFontSize(24)

    this.generateNoteMaps(model.id, model.id)

    return childNotes;
  }

  private isValidDuration(duration: number): boolean {
    return this.validDurations.includes(duration);
  }

  private createNoteWithDuration(
    duration: number,
    isRest = false,
    isAccented = false,
    dots = 0,
    engineID = "",
    beamID: string | null): StemmableNote {
    let durationString = this.durationToString(duration);
    
    const noteString = isRest
        ? `${durationString}r`
        : `${durationString}`;

    const note = this.factory.StaveNote({keys: [MIDDLE_NOTE], duration: noteString, dots: dots })

    if (isAccented == true && isRest == false) {
      note.addModifier(new Articulation("a>").setPosition(ModifierPosition.BELOW))
    }
    
    // Retrieve the auto-generated ID from VexFlow and add to map
    const generatedID = note.getAttribute("id");
    
    if (!generatedID) {
        throw new Error("VexFlow did not generate an ID for the note");
    }

    // map to da engine
    this.generateNoteMaps(engineID, generatedID)

    // add attribute for beaming pass
    if (beamID) note.setAttribute("beamID", beamID);

    return note;
}

  private durationToString(duration: number): string {
    switch (duration) {
      case 1:
        return 'w'; // Whole note
      case 2:
        return 'h'; // Half note
      case 4:
        return 'q'; // Quarter note
      case 8:
        return '8'; // Eighth note
      case 16:
        return '16'; // Sixteenth note
      case 32:
        return '32'; // Thirty-second note
      case 64:
        return '64'; // Sixty-fourth note
      case 128:
        return '128'; // One hundred twenty-eighth note
      case 256:
        return '256'; // Two hundred fifty-sixth note
      default:
        throw new Error(`Unsupported duration: ${duration}`);
    }
  }

  private durationStringToGlyph(durationString: string) {
        switch (durationString) {
      case 'w':
        return Glyphs.metNoteWhole; // Whole note
      case 'h':
        return Glyphs.metNoteHalfUp; // Half note
      case 'q':
        return Glyphs.metNoteQuarterUp; // Quarter note
      case '8':
        return Glyphs.metNote8thUp; // Eighth note
      case '16':
        return Glyphs.metNote16thUp; // Sixteenth note
      case '32':
        return Glyphs.metNote32ndUp; // Thirty-second note
      case '64':
        return Glyphs.metNote64thUp; // Sixty-fourth note
      case '128':
        return Glyphs.metNote128thUp; // One hundred twenty-eighth note
      case '256':
        return Glyphs.metNote256thUp; // Two hundred fifty-sixth note
      default:
        throw new Error(`Unsupported duration string: ${durationString}`);
    }
  }

  /**
   * helper function for dealing with creating note maps for use in touch detection
   * @param engineID 
   * @param vexID 
   */
  private generateNoteMaps(engineID: string, vexID: string){
    if (this.engineToRenderNotes[engineID] == undefined){
      this.engineToRenderNotes[engineID] = [vexID]
    } else {
      this.engineToRenderNotes[engineID].push(vexID)
    }
    // also do reciprical
    this.renderNotesToEngine[vexID] = engineID
  }

    /**
   * helper function for dealing with creating note maps for use in touch detection
   * @param engineID 
   * @param vexID 
   */
    private generateTieMaps(engineID: string, vexID: string){
      if (this.engineToRenderTies[engineID] == undefined){
        this.engineToRenderTies[engineID] = [vexID]
      } else {
        this.engineToRenderTies[engineID].push(vexID)
      }
      // also do reciprical
      this.renderTiesToEngine[vexID] = engineID
    }

  /**
   * Handles creating ties remakes 
   * @param engineID engine ID to generate notes for
   * @returns absolutly nothin
   */
  private generateTies(engineID: string){

    let renderedIDs = this.engineToRenderNotes[engineID]

    if (!renderedIDs || renderedIDs.length === 0) {
      return;
    }

    let tieSet: Set<string> = new Set()

    for (let i = 0; i < renderedIDs.length - 1; i++){
      let currentID = renderedIDs[i]
      let nextID = renderedIDs[i + 1]


      let currentElement = this.registry.getElementById(currentID) as StemmableNote
      let nextElement = this.registry.getElementById(nextID) as StemmableNote      

      if (!currentElement || !nextElement) {
        console.warn(`Could not find elements for tie: ${currentID} or ${nextID}`);
        continue;
      }


      if(currentElement && nextElement){

          // Check if either note is a rest and skip tie creation if so.
    if (typeof currentElement.isRest === "function" && currentElement.isRest()) {
      continue;
    }
    if (typeof nextElement.isRest === "function" && nextElement.isRest()) {
      continue;
    }
    
      let tie = this.factory.StaveTie({from: currentElement, to: nextElement})
      tieSet.add(tie.getAttribute("id"))
      }
    }

    // // add new note children to the map
    // let newNoteChildren = [...noteSet]
    // if (newNoteChildren.length == 0){
    //   return
    // }
    // this.engineToRenderNotes[engineID] = newNoteChildren

    // add new tie children to map
    let newTieChildren = [...tieSet]
    if (newTieChildren.length == 0){
      return
    }

    for (let childID of newTieChildren){
      this.generateTieMaps(engineID, childID)
    }
  }

  private beamByGroup(notes: StemmableNote[]) {
    // collect notes by their beamID
    const groups: Record<string, StemmableNote[]> = {};
    for (const note of notes) {
      const gid = note.getAttribute("beamID");
      if (!gid) continue;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(note);
    }

    // for each group with ≥2 notes, create & draw a beam
    for (const gid in groups) {
      const groupNotes = groups[gid];
      if (groupNotes.length < 2) continue;

      let allBeamable = true;
      for (const note of groupNotes){
        if (!isValidToBeam(note.getDuration())){
          allBeamable = false
          break
        }
      }
      if (!allBeamable) continue;
      this.factory.Beam({notes: groupNotes});
    }
  }
}