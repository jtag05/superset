"use client";

import { useEffect, useState } from "react";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { Badge } from "@superset/ui/badge";

interface WslDistribution {
	name: string;
	distributionName: string;
	defaultUid: number;
	isDefault: boolean;
}

interface WslStatus {
	isWslAvailable: boolean;
	isRunningUnderWsl: boolean;
	distribution: string | null;
}

export function WslSettings() {
	const [wslStatus, setWslStatus] = useState<WslStatus | null>(null);
	const [distributions, setDistributions] = useState<WslDistribution[]>([]);
	const [preferredDistro, setPreferredDistro] = useState<string>("");
	const [preferWslShells, setPreferWslShells] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		// In a real implementation, this would call tRPC or the main process
		// to get WSL status. For now, we show placeholder UI.
		const loadWslInfo = async () => {
			setIsLoading(true);
			try {
				// Placeholder - would call to main process
				// const status = await window.superset.getWslStatus();
				// const distros = await window.superset.listWslDistributions();
				// setWslStatus(status);
				// setDistributions(distros);
				setWslStatus({
					isWslAvailable: false,
					isRunningUnderWsl: false,
					distribution: null,
				});
				setDistributions([]);
			} catch (error) {
				console.error("Failed to load WSL info:", error);
			} finally {
				setIsLoading(false);
			}
		};

		loadWslInfo();
	}, []);

	const handlePreferredDistroChange = (value: string) => {
		setPreferredDistro(value);
		// Would save to settings via tRPC
	};

	const handlePreferWslShellsChange = (checked: boolean) => {
		setPreferWslShells(checked);
		// Would save to settings via tRPC
	};

	if (isLoading) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<div className="animate-pulse space-y-4">
					<div className="h-6 bg-muted rounded w-1/3"></div>
					<div className="h-4 bg-muted rounded w-1/2"></div>
					<div className="h-24 bg-muted rounded"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">WSL Settings</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure Windows Subsystem for Linux integration
				</p>
			</div>

			<div className="space-y-8">
				{/* WSL Status Section */}
				<div className="space-y-4">
					<h3 className="text-lg font-medium">WSL Status</h3>

					<div className="bg-card border rounded-lg p-4 space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-sm">WSL Available</span>
							<Badge
								variant={wslStatus?.isWslAvailable ? "default" : "secondary"}
							>
								{wslStatus?.isWslAvailable ? "Yes" : "No"}
							</Badge>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-sm">Running in WSL</span>
							<Badge
								variant={wslStatus?.isRunningUnderWsl ? "default" : "secondary"}
							>
								{wslStatus?.isRunningUnderWsl ? "Yes" : "No"}
							</Badge>
						</div>

						{wslStatus?.distribution && (
							<div className="flex items-center justify-between">
								<span className="text-sm">Current Distribution</span>
								<span className="text-sm font-medium">
									{wslStatus.distribution}
								</span>
							</div>
						)}
					</div>
				</div>

				{/* WSL Distribution Settings */}
				<div className="space-y-4">
					<h3 className="text-lg font-medium">Distribution</h3>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="preferred-distro" className="text-sm font-medium">
								Preferred Distribution
							</Label>
							<p className="text-xs text-muted-foreground">
								Select the default WSL distribution to use for terminal sessions
							</p>

							{distributions.length > 0 ? (
								<Select value={preferredDistro} onValueChange={handlePreferredDistroChange}>
									<SelectTrigger id="preferred-distro" className="w-full max-w-xs">
										<SelectValue placeholder="Select distribution" />
									</SelectTrigger>
									<SelectContent>
										{distributions.map((distro) => (
											<SelectItem
												key={distro.distributionName}
												value={distro.distributionName}
											>
												{distro.name}
												{distro.isDefault ? " (default)" : ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : (
								<p className="text-sm text-muted-foreground">
									No WSL distributions detected. Install WSL from the Microsoft
									Store to enable Linux development on Windows.
								</p>
							)}
						</div>
					</div>
				</div>

				{/* Terminal Integration */}
				<div className="space-y-4">
					<h3 className="text-lg font-medium">Terminal Integration</h3>

					<div className="bg-card border rounded-lg p-4">
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label
									htmlFor="prefer-wsl-shells"
									className="text-sm font-medium cursor-pointer"
								>
									Prefer WSL shells for WSL projects
								</Label>
								<p className="text-xs text-muted-foreground">
									When enabled, terminal sessions for projects in WSL paths (
									<code className="text-xs bg-muted px-1 py-0.5 rounded">
										\\wsl$\...
									</code>
									) will use WSL bash instead of Windows shells
								</p>
							</div>
							<Switch
								id="prefer-wsl-shells"
								checked={preferWslShells}
								onCheckedChange={handlePreferWslShellsChange}
							/>
						</div>
					</div>
				</div>

				{/* Help Section */}
				<div className="space-y-4">
					<h3 className="text-lg font-medium">Help</h3>

					<div className="bg-card border rounded-lg p-4 space-y-2">
						<p className="text-sm">
							<strong>What is WSL?</strong>
						</p>
						<p className="text-xs text-muted-foreground">
							Windows Subsystem for Linux (WSL) lets you run a Linux environment
							on Windows without a dual-boot setup. It&apos;s useful for Linux
							development workflows on Windows.
						</p>

						<p className="text-sm mt-4">
							<strong>Adding WSL Projects</strong>
						</p>
						<p className="text-xs text-muted-foreground">
							When adding a project, you can select folders from your WSL
							distributions. These projects will use Linux tools and shells.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
