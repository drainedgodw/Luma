import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * VS Code Dark+ token palette as a CodeMirror HighlightStyle — applied as
 * inline marks, so colors are guaranteed regardless of stylesheet loading.
 */
export const lumaHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#c586c0' },
  { tag: [t.controlKeyword, t.moduleKeyword], color: '#c586c0' },
  { tag: [t.definitionKeyword, t.modifier], color: '#569cd6' },
  { tag: [t.string, t.special(t.string)], color: '#ce9178' },
  { tag: [t.escape], color: '#d7ba7d' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#b5cea8' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6a9955', fontStyle: 'italic' },
  { tag: [t.variableName], color: '#9cdcfe' },
  { tag: [t.definition(t.variableName)], color: '#dcdcaa' },
  { tag: [t.function(t.variableName)], color: '#dcdcaa' },
  { tag: [t.propertyName], color: '#9cdcfe' },
  { tag: [t.function(t.propertyName)], color: '#dcdcaa' },
  { tag: [t.labelName], color: '#c8c8c8' },
  { tag: [t.macroName], color: '#dcdcaa' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#4fc1ff' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: '#4ec9b0' },
  { tag: [t.definition(t.typeName), t.definition(t.className)], color: '#4ec9b0' },
  { tag: [t.typeOperator, t.operator], color: '#d4d4d4' },
  { tag: [t.punctuation, t.separator, t.bracket], color: '#d4d4d4' },
  { tag: [t.brace], color: '#ffd700' },
  { tag: [t.tagName], color: '#569cd6' },
  { tag: [t.attributeName], color: '#9cdcfe' },
  { tag: [t.attributeValue], color: '#ce9178' },
  { tag: [t.heading], color: '#569cd6', fontWeight: 'bold' },
  { tag: [t.link, t.url], color: '#3798ff', textDecoration: 'underline' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.strong], fontWeight: 'bold' },
  { tag: [t.strikethrough], textDecoration: 'line-through' },
  { tag: [t.meta, t.documentMeta], color: '#808080' },
  { tag: [t.invalid], color: '#f44747' },
  { tag: [t.inserted], color: '#86efac' },
  { tag: [t.deleted], color: '#fca5a5' },
]);

export const lumaHighlighting = syntaxHighlighting(lumaHighlight, { fallback: true });
