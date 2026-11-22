import { emptyDesign, parseDesign, type Design } from './schema'

/** One change: set (or clear, with id = null) a finish target, or an edit (target "edit:<key>", id = the edit as JSON). */
export interface Op { target: string; id: string | null }

/**
 * Editable design with undo/redo. Pure: no DOM, no network. The UI calls set/undo/redo and
 * renders from `design`; `dirty` says whether there is anything to save since the last markSaved().
 */
export class DesignDoc {
  design: Design
  private undoStack: Op[][] = []
  private redoStack: Op[][] = []
  private savedJson: string
  constructor(design: Design = emptyDesign()) { this.design = parseDesign(design); this.savedJson = JSON.stringify(this.design) }

  /** Apply several ops as one undo step. Returns false if nothing changed. */
  apply(ops: Op[]): boolean {
    const inverse: Op[] = []
    for (const op of ops) {
      const prev = this.read(op.target)
      if (prev === op.id) continue
      inverse.unshift({ target: op.target, id: prev })
      this.write(op)
    }
    if (!inverse.length) return false
    this.undoStack.push(inverse); this.redoStack = []
    if (this.undoStack.length > 200) this.undoStack.shift()
    return true
  }
  set(target: string, id: string | null) { return this.apply([{ target, id }]) }
  undo() { return this.step(this.undoStack, this.redoStack) }
  redo() { return this.step(this.redoStack, this.undoStack) }
  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }
  get dirty() { return JSON.stringify(this.design) !== this.savedJson }
  markSaved() { this.savedJson = JSON.stringify(this.design) }
  /** Replace everything (e.g. after loading another version); history is cleared. */
  reset(design: Design) { this.design = parseDesign(design); this.undoStack = []; this.redoStack = []; this.markSaved() }

  private step(from: Op[][], to: Op[][]) {
    const ops = from.pop(); if (!ops) return false
    const inverse = ops.map(op => ({ target: op.target, id: this.read(op.target) })).reverse()
    ops.forEach(op => this.write(op)); to.push(inverse)
    return true
  }
  /** Set (or clear) a geometry edit as one undo step. */
  setEdit(key: string, edit: unknown | null) { return this.set('edit:' + key, edit == null ? null : JSON.stringify(edit)) }
  private read(target: string): string | null {
    if (target.startsWith('edit:')) { const e = this.design.edits[target.slice(5)]; return e ? JSON.stringify(e) : null }
    return this.design.finishes[target] ?? null
  }
  private write({ target, id }: Op) {
    if (target.startsWith('edit:')) {
      const edits = { ...this.design.edits }, key = target.slice(5)
      if (id == null) delete edits[key]; else edits[key] = JSON.parse(id)
      this.design = { ...this.design, edits }
      return
    }
    const next = { ...this.design.finishes }
    if (id == null) delete next[target]; else next[target] = id
    this.design = { ...this.design, finishes: next }
  }
}
