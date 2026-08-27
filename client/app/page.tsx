import SceneViewer from "@/components/SceneViewer";
import { sceneData } from "@/lib/SceneData";

export default function Home(){
  return (
    <main>
      <SceneViewer sceneData={sceneData}/>
    </main>
  )
}