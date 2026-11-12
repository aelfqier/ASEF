import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Opened from a Home Screen quick action: wait a moment so the web app is listening.
        if let item = connectionOptions.shortcutItem {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { _ = self.openQuickAction(item) }
        }
    }

    // Home Screen quick actions (long-press the app icon): "Add expense" and "Add income".
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(openQuickAction(shortcutItem))
    }

    private func openQuickAction(_ item: UIApplicationShortcutItem) -> Bool {
        let type = item.type.hasSuffix(".income") ? "income" : "expense"
        guard let url = URL(string: "asef://add?type=\(type)") else { return false }
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
