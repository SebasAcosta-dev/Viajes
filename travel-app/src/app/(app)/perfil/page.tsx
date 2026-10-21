import { permanentRedirect } from "next/navigation";

export default function PerfilPage() {
  permanentRedirect("/cuenta?tab=preferences");
}
