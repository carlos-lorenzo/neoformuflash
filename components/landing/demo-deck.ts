/*
 * Demo fixtures for the landing-page sample session (components/landing).
 *
 * Five flashcards hand-authored as NoteDoc, the same frozen content union a
 * real deck stores. Fronts are recallable prompts; backs are the equation, so
 * the reveal renders Computer Modern against the serif reading surface — the
 * exact pairing a student sees mid-review. No backend, no account: this deck
 * is the one place the product is faked, and it is labelled "Sample session"
 * so the fiction is honest.
 */

import type { NoteDoc } from '@neoformuflash/contracts';

export type DemoCard = {
  front: NoteDoc;
  back: NoteDoc;
};

function promptDoc(text: string): NoteDoc {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

function equationDoc(latex: string): NoteDoc {
  return {
    type: 'doc',
    content: [{ type: 'displayMath', latex }],
  };
}

export const DEMO_CARDS: DemoCard[] = [
  {
    front: promptDoc("Coulomb's law — force between two point charges"),
    back: equationDoc(
      String.raw`F = \frac{1}{4\pi\varepsilon_0}\,\frac{q_1 q_2}{r^2}`
    ),
  },
  {
    front: promptDoc("Gauss's law — integral form"),
    back: equationDoc(
      String.raw`\oint_A \mathbf{E}\cdot d\mathbf{A} = \frac{Q_{\mathrm{enc}}}{\varepsilon_0}`
    ),
  },
  {
    front: promptDoc('Capacitance of a parallel-plate capacitor'),
    back: equationDoc(String.raw`C = \frac{\varepsilon_0 A}{d}`),
  },
  {
    front: promptDoc('Electric potential of a point charge'),
    back: equationDoc(
      String.raw`V(r) = \frac{1}{4\pi\varepsilon_0}\,\frac{q}{r}`
    ),
  },
  {
    front: promptDoc('Energy density of an electrostatic field'),
    back: equationDoc(String.raw`u = \frac{1}{2}\,\varepsilon_0 E^2`),
  },
];
