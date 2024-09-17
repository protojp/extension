eagle.onPluginCreate((plugin) => {
	console.log('eagle.onPluginCreate');
	console.log(plugin);
	document.querySelector('#message').innerHTML = `
	<ul>
		<li>id: ${plugin.manifest.id}</li>
		<li>version: ${plugin.manifest.version}</li>
		<li>name: ${plugin.manifest.name}</li>
		<li>logo: ${plugin.manifest.logo}</li>
		<li>path: ${plugin.path}</li>
	</ul>
	`;
	// 実行
	(async () => {
		const tags = (await eagle.tag.get());

		console.log("UPLOAD_IMGS 開始！");

		console.log(tags);
	})();
});

eagle.onPluginRun(() => {
	console.log('eagle.onPluginRun');
});

eagle.onPluginShow(() => {
	console.log('eagle.onPluginShow');
});

eagle.onPluginHide(() => {
	console.log('eagle.onPluginHide');
});

eagle.onPluginBeforeExit((event) => {
	console.log('eagle.onPluginBeforeExit');
});