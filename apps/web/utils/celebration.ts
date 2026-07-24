// Space-themed brand illustrations (public/images/celebration)
const urls = [
  "/images/celebration/rocket-launch.svg",
  "/images/celebration/orbit.svg",
  "/images/celebration/to-the-moon.svg",
];

export const getCelebrationImage = () =>
  urls[Math.floor(Math.random() * urls.length)];
