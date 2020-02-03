const FirstOrDefault = (list) => {
	if (list.length < 1) {
		return null;
	}

	return list[0];
};

const RemoveChildren = (parent) => {
	while (parent.firstChild) {
		parent.firstChild.remove();
	}
};

class TabService {
	async CurrentTab() {
		return new Promise((resolve, reject) => {
			return chrome.tabs.query({
				active: true,
				currentWindow: true
			}, (result) => {
				if (chrome.runtime.lastError) {
					return reject(chrome.runtime.lastError.message);
				}

				const tab = FirstOrDefault(result);

				if (!tab) {
					return reject("current tab not found");
				}

				return resolve({
					url: tab.url,
					title: tab.title,
					favIconUrl: tab.favIconUrl
				});
			});
		});
	}
};

class BookmarkService {
	async GetTree() {
		return new Promise((resolve, reject) => {
			return chrome.bookmarks.getTree(function (result) {
				if (chrome.runtime.lastError) {
					return reject(chrome.runtime.lastError.message);
				}

				return resolve(FirstOrDefault(result));
			});
		});
	}

	async CreateBookmark({
		parentId,
		title,
		url,
		index
	}) {
		return new Promise((resolve, reject) => {
			return chrome.bookmarks.create({
				parentId,
				title,
				url,
				index
			}, function (result) {
				if (chrome.runtime.lastError) {
					return reject(chrome.runtime.lastError.message);
				}

				return resolve(result);
			});
		});
	}

	async MoveBookmark({
		bookmarkId,
		parentId,
		index
	}) {
		return new Promise((resolve, reject) => {
			return chrome.bookmarks.move(bookmarkId, {
				parentId,
				index
			}, function (result) {
				if (chrome.runtime.lastError) {
					return reject(chrome.runtime.lastError.message);
				}

				return resolve(result);
			});
		});
	}

	async UpdateBookmark({
		bookmarkId,
		title,
		url
	}) {
		return new Promise((resolve, reject) => {
			return chrome.bookmarks.update(bookmarkId, {
				title,
				url
			}, function (result) {
				if (chrome.runtime.lastError) {
					return reject(chrome.runtime.lastError.message);
				}

				return resolve(result);
			});
		});
	}

	async RemoveBookmark(bookmarkId) {
		return new Promise((resolve, reject) => {
			return chrome.bookmarks.remove(bookmarkId, function (result) {
				if (chrome.runtime.lastError) {
					return reject(chrome.runtime.lastError.message);
				}

				return resolve(result);
			});
		});
	}

	async RemoveFolder(folderId) {
		return new Promise((resolve, reject) => {
			return chrome.bookmarks.removeTree(folderId, function () {
				if (chrome.runtime.lastError) {
					return reject(chrome.runtime.lastError.message);
				}

				return resolve();
			});
		});
	}
};

class IndexService {
	async SearchFolderByText(text) {
		if (!text) {
			return [];
		}

		const pattern = `${text}`;
		const regExp = new RegExp(pattern, 'i');
		const resultList = this.index.filter((item) => {
			if (item.url) {
				return false;
			}

			if (!item.title) {
				return false;
			}

			return regExp.test(item.title);
		});
		return resultList;
	}

	async SearchFolderById(folderId) {
		const resultList = this.index.filter((item) => {
			return item.id == folderId;
		});
		return resultList;
	}

	async SearchBookmarkById(folderId) {
		const resultList = this.index.filter((item) => {
			return item.id == folderId;
		});
		return resultList;
	}

	async SearchBookmarkByUrl(url) {
		if (!url) {
			return [];
		}

		const resultList = this.index.filter((item) => {
			return item.url == url;
		});
		return resultList;
	}

	async UpdateIndex() {
		const bookmarkService = new BookmarkService();
		const tree = await bookmarkService.GetTree();
		const newIndex = [];
		await this._probe(tree, newIndex);
		this.index = newIndex;
	}

	async _probe(node, newIndex) {
		const {
			id,
			index,
			parentId,
			title,
			url,
			children
		} = node;
		newIndex.push({
			id,
			index,
			parentId,
			title,
			url,
			children
		});

		if (node.children) {
			for (let child of node.children) {
				await this._probe(child, newIndex);
			}
		}
	}
};

const tabService = new TabService();
const bookmarkService = new BookmarkService();
const indexService = new IndexService();

class TextInputController {
	async Bind(query) {
		this.domElement = document.querySelector(query);
	}

	async SetText(text) {
		this.domElement.value = text;
	}

	async GetText() {
		return this.domElement.value;
	}
}

class SearchInputController {
	async BindInput(query) {
		this.inputElement = document.querySelector(query);
	}

	async BindResult(query) {
		this.resultElement = document.querySelector(query);
	}

	async AddInputListener(lambda) {
		this.inputElement.addEventListener("keyup", lambda);
	}

	async SetResultItemListener(lambda) {
		this.resultItemListener = lambda;
	}

	async SetText(text) {
		this.inputElement.value = text;
	}

	async GetText() {
		return this.inputElement.value;
	}

	async SetResult(result) {
		RemoveChildren(this.resultElement);
		let searchText = await this.GetText();
		let pattern = new RegExp(`${searchText}`, "gi");
		result = result.slice(0, 50);
		
		result.forEach((item) => {
			let itemElement = document.createElement("button");
			itemElement.classList.add('item');
			let text = item.title;
			let matches = text.match(pattern);
			let match = FirstOrDefault(matches);
			text = text.replace(match, `<b>${match}</b>`);
			
			// matches.forEach((match) => {
			// 	text = text.replace(match, `<b>${match}</b>`);
			// });
			
			itemElement.innerHTML = text;
			
			itemElement.addEventListener("click", () => {
				RemoveChildren(this.resultElement);
				this.SetText(item.title);
				this.Focus();
				return this.resultItemListener(item);
			});
			this.resultElement.appendChild(itemElement);
		});
	}

	async Focus() {
		this.inputElement.focus();
	}
}

class FolderContentController {
	async Bind(query) {
		this.folderElement = document.querySelector(query);
	}

	async SetFolder(folderNode) {
		this.folderNode = folderNode;
		await this.RefreshFolder();
	}

	async GetFolder() {
		return this.folderNode;
	}

	async RefreshFolder() {
		if (!this.folderNode || !this.folderNode.id) {
			return;
		}

		await indexService.UpdateIndex();
		this.folderNode = FirstOrDefault(await indexService.SearchFolderById(this.folderNode.id));
		RemoveChildren(this.folderElement);

		if (!this.folderNode || !this.folderNode.children) {
			return;
		}

		let list = this.folderNode.children;
		list = list.filter(i => i.url);
		list.forEach((item) => {
			var itemElement = document.createElement("div");
			itemElement.classList.add('item');
			this.folderElement.appendChild(itemElement);

			var linkElement = document.createElement("a");
			linkElement.innerText = item.title;
			linkElement.href = item.url;
			linkElement.title = item.url;
			itemElement.appendChild(linkElement);
			itemElement.addEventListener("click", () => {
				chrome.tabs.create({
					url: item.url
				});
			});
		});
	}
}

class ButtonController {
	async Bind(query) {
		this.buttonElement = document.querySelector(query);
	}

	async AddClickListener(lambda) {
		this.buttonElement.addEventListener("click", lambda);
	}
};

class ProgressController {
	async Bind(query) {
		this.progressElement = document.querySelector(query);
	}

	async ShowDefault() {
		this.progressElement.classList.remove("failure");
		this.progressElement.classList.remove("success");
		this.progressElement.classList.remove("loading");
	}

	async ShowSuccess() {
		this.ShowDefault();
		setTimeout(() => {
			this.progressElement.classList.add("success");
		}, 100);
	}

	async ShowFailure() {
		this.ShowDefault();
		setTimeout(() => {
			this.progressElement.classList.add("failure");
		}, 100);
	}

	async ShowLoading() {
		this.ShowDefault();
		setTimeout(() => {
			this.progressElement.classList.add("loading");
		}, 100);
	}
}

const runAsync = async () => {
	const progressController = new ProgressController();
	await progressController.Bind(".progress");

	const urlTextInput = new TextInputController();
	await urlTextInput.Bind(".main .url.input");
	const titleTextInput = new TextInputController();
	await titleTextInput.Bind(".main .title.input");
	const folderTextInput = new TextInputController();
	await folderTextInput.Bind(".main .folder.input");
	const folderSearchInput = new SearchInputController();
	await folderSearchInput.BindInput(".main .folder.search.input");
	await folderSearchInput.BindResult(".main .search.result");
	await folderSearchInput.Focus();
	const folderContent = new FolderContentController();
	await folderContent.Bind(".main .folder.result");

	{
		const tab = await tabService.CurrentTab();
		await urlTextInput.SetText(tab.url);
		await titleTextInput.SetText(tab.title);
		await indexService.UpdateIndex();
		const bookmark = FirstOrDefault(await indexService.SearchBookmarkByUrl(tab.url));

		if (bookmark) {
			const folder = FirstOrDefault(await indexService.SearchFolderById(bookmark.parentId));
			await folderContent.SetFolder(folder);
			await folderSearchInput.SetText(folder.title);
			await folderTextInput.SetText(folder.title);
		}
	}

	const upsertBookmarkButton = new ButtonController();
	await upsertBookmarkButton.Bind(".main .upsert.bookmark.button");
	const upsertBookmarkClick = async () => {
		try {
			console.log("upsert bookmark");
			const folder = await folderContent.GetFolder();
			const parentId = folder.id;
			const url = await urlTextInput.GetText();
			const title = await titleTextInput.GetText();
			await indexService.UpdateIndex();
			const existingBookmark = FirstOrDefault(await indexService.SearchBookmarkByUrl(url));

			if (existingBookmark) {
				console.log("update bookmark");
				const bookmarkId = existingBookmark.id;
				await bookmarkService.MoveBookmark({
					bookmarkId,
					parentId
				});
				await bookmarkService.UpdateBookmark({
					bookmarkId,
					title,
					url
				});
			} else {
				console.log("create bookmark");
				await bookmarkService.CreateBookmark({
					parentId,
					url,
					title
				});
			}

			await progressController.ShowSuccess();
		} catch (e) {
			await progressController.ShowFailure(e);
		} finally {
			await folderContent.RefreshFolder();
		}
	};
	await upsertBookmarkButton.AddClickListener(upsertBookmarkClick);

	const deleteBookmarkButton = new ButtonController();
	await deleteBookmarkButton.Bind(".main .delete.bookmark.button");
	await deleteBookmarkButton.AddClickListener(async () => {
		try {
			const url = await urlTextInput.GetText();
			await indexService.UpdateIndex();
			const existingBookmark = FirstOrDefault(await indexService.SearchBookmarkByUrl(url));

			if (existingBookmark) {
				const bookmarkId = existingBookmark.id;
				await bookmarkService.RemoveBookmark(bookmarkId);
				await progressController.ShowSuccess();
			}

		} catch (e) {
			await progressController.ShowFailure(e);
		} finally {
			await folderContent.RefreshFolder();
		}
	});

	const deleteFolderButton = new ButtonController();
	await deleteFolderButton.Bind(".main .delete.folder.button");
	await deleteFolderButton.AddClickListener(async () => {
		try {
			const folder = await folderContent.GetFolder();
			await bookmarkService.RemoveFolder(folder.id);
			await progressController.ShowSuccess();
		} catch (e) {
			await progressController.ShowFailure(e);
		}
	});

	const upsertFolderButton = new ButtonController();
	await upsertFolderButton.Bind(".main .upsert.folder.button");
	await upsertFolderButton.AddClickListener(async () => {
		try {
			const title = await folderTextInput.GetText();

			if (!title) {
				return;
			}

			const folder = await folderContent.GetFolder();

			if (folder) {
				const folderId = folder.id;

				await bookmarkService.UpdateBookmark({
					bookmarkId: folderId,
					title,
				});
			} else {
				await bookmarkService.CreateBookmark({
					title,
				});
			}

			await progressController.ShowSuccess();
		} catch (e) {
			await progressController.ShowFailure(e);
		} finally {
			await folderContent.RefreshFolder();
		}
	});

	await folderSearchInput.AddInputListener(async (e) => {
		if (e.code == "Enter") {
			await upsertBookmarkClick();
		} else {
			const searchText = await folderSearchInput.GetText();
			const result = await indexService.SearchFolderByText(searchText);
			await folderSearchInput.SetResult(result);
			await folderContent.SetFolder(null);
			await indexService.UpdateIndex();
		}
	});

	await folderSearchInput.SetResultItemListener(async (item) => {
		await folderContent.SetFolder(item);
		await folderTextInput.SetText(item.title);
	});
};

runAsync().catch(e => {
	console.error(e);
});