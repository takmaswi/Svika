/**
 * Public, demo-only persona metadata used by the landing page and the
 * passenger-shell action sheet. Lives outside `lib/personas.ts` so it can be
 * imported into client components without dragging in `next/headers`-bound
 * server code.
 */

export type PersonaSlug = "tendai" | "rudo" | "farai" | "baba_tino";

export interface PersonaMeta {
  slug: PersonaSlug;
  name: string;
  initial: string;
  role_label: string;
  surface_label: string;
  surface_url: string;
}

export const PERSONA_META: ReadonlyArray<PersonaMeta> = [
  {
    slug: "tendai",
    name: "Tendai",
    initial: "T",
    role_label: "Passenger",
    surface_label: "/?as=tendai",
    surface_url: "/?as=tendai",
  },
  {
    slug: "rudo",
    name: "Rudo",
    initial: "R",
    role_label: "Passenger",
    surface_label: "/?as=rudo",
    surface_url: "/?as=rudo",
  },
  {
    slug: "farai",
    name: "Farai",
    initial: "F",
    role_label: "Conductor",
    surface_label: "/hwindi?as=farai",
    surface_url: "/hwindi?as=farai",
  },
  {
    slug: "baba_tino",
    name: "Baba Tino",
    initial: "B",
    role_label: "Fleet owner",
    surface_label: "/fleet?as=baba_tino",
    surface_url: "/fleet?as=baba_tino",
  },
];

export function findPersonaMeta(slug: string): PersonaMeta | undefined {
  return PERSONA_META.find((p) => p.slug === slug);
}
