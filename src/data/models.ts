export type ValidDuration = 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256;

export enum RhythmType {
    Note,
    Tuplet
  }
  

export type Note = {
    id: string;
    kind: RhythmType.Note;
    duration: ValidDuration;
    isRest?: boolean;
    dots?: number;
    isTied?: boolean;
    isAccented?: boolean;
    beamID: string | null
  }

export type Tuplet = {
    id: string
    kind: RhythmType.Tuplet;
    children: PreRenderModel[]
    // these two are to be in line with the Vexflow meaning. See vexflow docs for more
    numNotes: number 
    notesOccupied: number
    suffix?: number
}

export type PreRenderModel = Note | Tuplet

export type RhythmNode = {
    id: string
    size: number
    children: RhythmNode[]
    isRest: boolean
    isAccented: boolean
    beamID: string | null
}