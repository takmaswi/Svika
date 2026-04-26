// Re-export the passenger root so / serves the passenger surface.
// The (passenger) route group is the authoritative source; this file just
// keeps Next happy when the root is not a route group itself.
export { default } from "./(passenger)/page";
