import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration, keymap, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

/**
 * Ghost-text inline completion: after each keystroke pause the field computes a
 * single word-level suggestion (document words + language keywords) and renders
 * it as a dim widget after the cursor. Tab accepts, any other edit dismisses.
 */

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: GhostWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-ghostText';
    span.textContent = this.text;
    return span;
  }
}

interface Suggestion {
  text: string;
  pos: number;
}

export const clearSuggestion = StateEffect.define<null>();
export const setSuggestion = StateEffect.define<Suggestion>();

const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSuggestion)) return e.value;
      if (e.is(clearSuggestion)) return null;
    }
    if (tr.docChanged || tr.selection) return null;
    return value;
  },
});

const ghostDecoration = EditorView.decorations.compute([suggestionField], (state) => {
  const s = state.field(suggestionField);
  if (!s || s.pos !== state.selection.main.head) return Decoration.none;
  return Decoration.set([
    Decoration.widget({ widget: new GhostWidget(s.text), side: 1 }).range(s.pos),
  ]);
});

const identifierChars = /[A-Za-z0-9_$]/;

function inStringOrComment(state: EditorState, pos: number): boolean {
  const node = syntaxTree(state).resolveInner(pos, -1);
  const t = node.type.name;
  return /String|Comment|LineComment|BlockComment/.test(t);
}

function computeSuggestion(view: EditorView, keywords: string[]): Suggestion | null {
  const state = view.state;
  const pos = state.selection.main.head;
  if (!state.selection.main.empty) return null;
  if (inStringOrComment(state, pos)) return null;

  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const match = /[A-Za-z_$][A-Za-z0-9_$]*$/.exec(before);
  if (!match || match[0].length < 2) return null;
  const prefix = match[0];

  // gather candidate words: keywords + identifiers from the document
  const doc = state.doc.sliceString(0, Math.min(state.doc.length, 200_000));
  const seen = new Set<string>();
  for (const kw of keywords) {
    if (kw.toLowerCase().startsWith(prefix.toLowerCase()) && kw.length > prefix.length)
      seen.add(kw);
  }
  const wordRe = /[A-Za-z_$][A-Za-z0-9_$]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(doc)) !== null) {
    const w = m[0];
    if (w.startsWith(prefix) && w.length > prefix.length && w.length <= 40) seen.add(w);
    if (seen.size > 500) break;
  }

  const docLowerPrefixHits = [...seen].sort((a, b) => a.length - b.length);
  if (docLowerPrefixHits.length === 0) return null;
  const text = docLowerPrefixHits[0].slice(prefix.length);
  return { text, pos };
}

export function inlineSuggestion(keywords: string[], enabled: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return [
    suggestionField,
    ghostDecoration,
    EditorView.updateListener.of((update) => {
      if (!enabled()) return;
      if (timer) clearTimeout(timer);
      if (update.docChanged || update.selectionSet) {
        const view = update.view;
        timer = setTimeout(() => {
          const s = computeSuggestion(view, keywords);
          view.dispatch({ effects: s ? setSuggestion.of(s) : clearSuggestion.of(null) });
        }, 90);
      }
    }),
    Prec.highest(
      keymap.of([
        {
          key: 'Tab',
          run: (view) => {
            const s = view.state.field(suggestionField, false);
            if (s && s.pos === view.state.selection.main.head) {
              view.dispatch({
                changes: { from: s.pos, insert: s.text },
                selection: { anchor: s.pos + s.text.length },
                effects: clearSuggestion.of(null),
              });
              return true;
            }
            return false;
          },
        },
        {
          key: 'Escape',
          run: (view) => {
            const s = view.state.field(suggestionField, false);
            if (s) {
              view.dispatch({ effects: clearSuggestion.of(null) });
              return true;
            }
            return false;
          },
        },
      ])
    ),
  ];
}
