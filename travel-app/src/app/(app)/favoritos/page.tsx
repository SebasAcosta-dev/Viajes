import { permanentRedirect } from "next/navigation";

export default function FavoritosPage() {
  permanentRedirect("/cuenta?tab=favorites");
}
