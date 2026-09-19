/** @type {import('next').NextConfig} */
export default {
  // reactCompiler is deliberately OFF: it mis-memoizes react-three-fiber's
  // ref-mutation patterns (pmndrs/react-three-fiber#3274).
};
