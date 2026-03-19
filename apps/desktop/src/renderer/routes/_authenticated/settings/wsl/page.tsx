import { createFileRoute } from "@tanstack/react-router";
import { WslSettings } from "./components/WslSettings";

export const Route = createFileRoute("/_authenticated/settings/wsl/")({
	component: WslSettingsPage,
});

function WslSettingsPage() {
	return <WslSettings />;
}
