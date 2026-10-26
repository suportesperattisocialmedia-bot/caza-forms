export function publicUrl(slug) {
  if (typeof window === "undefined") return "/f/" + slug;
  return `${window.location.origin}/f/${slug}`;
}
