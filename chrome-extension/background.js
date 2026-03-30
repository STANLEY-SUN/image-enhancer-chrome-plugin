const MENU_ID = "image-enhancer-pro-context";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Enhance this image",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) {
    return;
  }

  const popupUrl = new URL(chrome.runtime.getURL("popup.html"));
  popupUrl.searchParams.set("imageUrl", info.srcUrl);

  chrome.tabs.create({ url: popupUrl.toString() });
});
