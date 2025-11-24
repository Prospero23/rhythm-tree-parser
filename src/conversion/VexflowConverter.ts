import { StemmableNote, Factory, Registry, ModifierPosition, Articulation} from 'vexflow';
import {RhythmType, type PreRenderModel, type Note, type Tuplet} from '../data/models';
import isValidToBeam from '../helpers/isValidToBeam';

/**
 * Maps a tree node ID to all the VexFlow IDs generated for it.
 * Used for tying and selection.
 */
export type EngineMap = Record<string, string[]>
/**
 * Maps a VexFlow-rendered element ID to its originating tree node ID.
 * Used for selection and reverse lookup.
 */
export type RenderMap = Record<string, string>

/**
 * Full settings used internally for rendering.
 */
interface VexflowConverterSettings {
  noteName: string;
}
/**
 * Options exposed to the user. All optional.
 */
interface VexflowConverterOptions {
  noteName?: string;
}

const defaultSettings: VexflowConverterSettings = {
  noteName: "B/4"
}

/**
 * Converts PreRenderModels to what is needed for VexFlow.
 */
export default class VexflowConverter {
  private factory: Factory; 
  private registry: Registry;
  private validDurations: number[];
  private engineToRenderNotes: EngineMap
  private renderNotesToEngine: RenderMap
  private engineToRenderTies: EngineMap
  private renderTiesToEngine: RenderMap
  private settings: VexflowConverterSettings

  constructor(factory: Factory, options: VexflowConverterOptions = {}) {
    this.factory = factory;
    this.registry = new Registry();
    Registry.enableDefaultRegistry(this.registry) //auto adds notes to registry 
    this.validDurations = [1, 2, 4, 8, 16, 32, 64, 128, 256];
    this.engineToRenderNotes = {}
    this.renderNotesToEngine = {}
    this.engineToRenderTies = {}
    this.renderTiesToEngine = {}
    this.settings = {...defaultSettings, ...options};
  }

  /**
   * Convert an array of PreRenderModels into VexFlow StemmableNotes.
   * Handles note creation, tuplets, ties, and beams.
   *
   * @param nodes Array of PreRenderModel objects from PreRenderConverter.
   * @returns All generated StemmableNotes.
   */
  processNodes(nodes: PreRenderModel[]): StemmableNote[] {
    const result: StemmableNote[] = [];

    // Render and register all notes.
    for (const node of nodes) {
      const renderedNotes = this.proccessNode(node);
      result.push(...renderedNotes);
    }

    // Generate ties.
    for (const engineID in this.engineToRenderNotes){
      this.generateTies(engineID)
    }

    // Generate beams.
    this.beamByGroup(result)

    return result
  }

  /**
   * @returns a combined mapping of:
   * - engineID to [all note IDs + tie IDs]
   *
   * Used for selection and interaction.
   */
  getEngine2VexMap(): EngineMap {
    const combinedMap: EngineMap = {};
  
    // Add all note IDs from engineToRenderNotes.
    Object.keys(this.engineToRenderNotes).forEach(engineID => {
      // Start with a copy of the note IDs.
      combinedMap[engineID] = [...this.engineToRenderNotes[engineID]];
  
      // If there are any ties for this engine, add them.
      if (this.engineToRenderTies[engineID]) {
        combinedMap[engineID] = combinedMap[engineID].concat(this.engineToRenderTies[engineID]);
      }
    });
  
    // TODO: If there are any engineIDs that exist only in the ties map, add those as well.
    // NOTE: not needed for now. Maybe in the future.
    return combinedMap;
  }

  /**
   * 
   * @returns VexFlow to engine id mappings
   * Used when clicking VexFlow-rendered objects
   */
  getVex2EngineMap(): RenderMap {
    // TODO: make combined map actually work when clicking ties but for now whatever.
    const combinedMap: RenderMap = {...this.renderNotesToEngine, ...this.renderTiesToEngine}; 
    
    return combinedMap
  }

  private proccessNode(model: PreRenderModel): StemmableNote[] {
    switch (model.kind) {
      case RhythmType.Note:
        return this.renderNote(model);
      case RhythmType.Tuplet:
        return this.renderTuplet(model);
    }
  }

  private renderNote(model: Note): StemmableNote[] {
    const duration = model.duration;
    if (!this.isValidDuration(duration)) {
      throw new Error(`Invalid duration: ${duration} at node ${JSON.stringify(model)}`);
    }
    return [this.createNoteWithDuration(model.duration, model.isRest, model.isAccented, model.dots, model.id, model.beamID)];
  }

  private renderTuplet(model: Tuplet): StemmableNote[] {
    const childNotes: StemmableNote[] = this.processNodes(model.children);

    const tuplet = this.factory.Tuplet({notes: childNotes, options: {numNotes: model.numNotes, notesOccupied: model.notesOccupied, ratioed: true}}) 
    
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
    const durationString = this.durationToString(duration);
    
    const noteString = isRest
        ? `${durationString}r`
        : `${durationString}`;

    const note = this.factory.StaveNote({keys: [this.settings.noteName], duration: noteString, dots: dots })

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

  private generateNoteMaps(engineID: string, vexID: string){
    if (this.engineToRenderNotes[engineID] == undefined){
      this.engineToRenderNotes[engineID] = [vexID]
    } else {
      this.engineToRenderNotes[engineID].push(vexID)
    }
    // also do reciprical...
    this.renderNotesToEngine[vexID] = engineID
  }

  private generateTieMaps(engineID: string, vexID: string){
    if (this.engineToRenderTies[engineID] == undefined){
      this.engineToRenderTies[engineID] = [vexID]
    } else {
      this.engineToRenderTies[engineID].push(vexID)
    }
    // also do reciprical...
    this.renderTiesToEngine[vexID] = engineID
  }

  private generateTies(engineID: string){

    const renderedIDs = this.engineToRenderNotes[engineID]

    if (!renderedIDs || renderedIDs.length === 0) {
      return;
    }

    const tieSet = new Set<string>()

    for (let i = 0; i < renderedIDs.length - 1; i++){
      const currentID = renderedIDs[i]
      const nextID = renderedIDs[i + 1]


      const currentElement = this.registry.getElementById(currentID) as StemmableNote
      const nextElement = this.registry.getElementById(nextID) as StemmableNote      

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
    
      const tie = this.factory.StaveTie({from: currentElement, to: nextElement})
      tieSet.add(tie.getAttribute("id"))
      }
    }

    // Add new tie children to map.
    const newTieChildren = [...tieSet]
    if (newTieChildren.length == 0){
      return
    }

    for (const childID of newTieChildren){
      this.generateTieMaps(engineID, childID)
    }
  }

  private beamByGroup(notes: StemmableNote[]) {
    // Collect notes by their beamID.
    const groups: Record<string, StemmableNote[]> = {};
    for (const note of notes) {
      const gid = note.getAttribute("beamID");
      if (!gid) continue;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(note);
    }

    // For each group with >= 2 notes, create & draw a beam.
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