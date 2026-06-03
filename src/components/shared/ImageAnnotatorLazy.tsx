import { lazy, Suspense, type ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';

// ImageAnnotator pulls in react-konva + konva (~hundreds of KB). Loading it
// lazily means that weight is fetched only when a user actually opens the
// drawing/annotation modal — not on every page that *might* show it.
const ImageAnnotator = lazy(() => import('./ImageAnnotator'));

type Props = ComponentProps<typeof ImageAnnotator>;

export default function ImageAnnotatorLazy(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black w-screen h-screen">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      }
    >
      <ImageAnnotator {...props} />
    </Suspense>
  );
}
