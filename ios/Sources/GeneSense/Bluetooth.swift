import CoreBluetooth
import SwiftUI

/// Bluetooth for the page, since iPhone browsers have no Web Bluetooth.
///
/// The page asks for a set of GATT service/characteristic pairs (`window.gsNative.ble.connect`). The user picks a
/// device in a native sheet; the app subscribes and forwards each notification's raw bytes, which the page parses
/// with the same code it uses for Web Bluetooth (frontend/js/ble.js).
@MainActor
final class Bluetooth: NSObject, ObservableObject {
    struct Found: Identifiable {
        let id: UUID
        let peripheral: CBPeripheral
        var name: String
        var measures: String
        var rssi: Int
    }

    @Published var picking = false
    @Published var found: [Found] = []
    @Published var connecting: UUID?
    @Published var searchedLong = false

    /// Runs JavaScript in the page.
    var run: (String) -> Void = { _ in }

    private var central: CBCentralManager?
    private var pairs: [CBUUID: CBUUID] = [:]  // service: characteristic
    private var peripheral: CBPeripheral?
    private var request: Int?                  // page call waiting for the connect result
    private var servicesLeft = 0
    private var subscribed = 0
    private var searchTimer: Timer?

    private static let names: [String: String] = ["180D": "Nhịp tim", "1822": "SpO₂", "1810": "Huyết áp", "1808": "Đường huyết"]

    func connect(id: Int, pairs list: [[String: String]]) {
        if let old = request { fail(old, "AbortError", "Đã mở lại danh sách máy đo.") }
        disconnect()
        request = id
        pairs = Dictionary(list.compactMap { pair in
            guard let service = pair["service"], let characteristic = pair["characteristic"] else { return nil }
            return (CBUUID(string: service.uppercased()), CBUUID(string: characteristic.uppercased()))
        }, uniquingKeysWith: { first, _ in first })
        found = []
        connecting = nil
        searchedLong = false
        picking = true
        if let central { centralManagerDidUpdateState(central) } else { central = CBCentralManager(delegate: self, queue: nil) }
    }

    func choose(_ device: Found) {
        guard connecting == nil, let central else { return }
        connecting = device.id
        central.stopScan()
        peripheral = device.peripheral
        central.connect(device.peripheral)
    }

    /// The sheet was closed without a connected device.
    func dismissed() {
        guard let id = request else { return }
        stopSearching()
        if let peripheral { central?.cancelPeripheralConnection(peripheral) }
        peripheral = nil
        fail(id, "NotFoundError", "Chưa chọn máy đo.")
    }

    func disconnect() {
        if let peripheral { central?.cancelPeripheralConnection(peripheral) }
        peripheral = nil
    }

    private func startSearching() {
        central?.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        searchTimer?.invalidate()
        searchTimer = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.searchedLong = true }
        }
    }

    private func stopSearching() {
        central?.stopScan()
        searchTimer?.invalidate()
    }

    private func succeed(name: String) {
        guard let id = request else { return }
        request = nil
        picking = false
        run("window.gsNative._resolve(\(id), \(Self.json(["name": name, "services": subscribed])))")
    }

    private func fail(_ id: Int, _ name: String, _ message: String) {
        if request == id { request = nil }
        picking = false
        run("window.gsNative._reject(\(id), \(Self.json(name)), \(Self.json(message)))")
    }

    private func failRequest(_ message: String) {
        guard let id = request else { return }
        stopSearching()
        disconnect()
        fail(id, "NetworkError", message)
    }

    private static func json(_ value: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]) else { return "null" }
        return String(decoding: data, as: UTF8.self)
    }
}

extension Bluetooth: @MainActor CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard request != nil else { return }
        switch central.state {
        case .poweredOn: startSearching()
        case .poweredOff: failRequest("Bluetooth đang tắt. Bật Bluetooth rồi thử lại.")
        case .unauthorized: failRequest("GeneSense chưa được dùng Bluetooth. Vào Cài đặt > GeneSense và bật Bluetooth.")
        case .unsupported: failRequest("Thiết bị này không hỗ trợ Bluetooth.")
        default: break  // .unknown / .resetting: wait for the next update
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let advertised = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? [])
            + (advertisementData[CBAdvertisementDataOverflowServiceUUIDsKey] as? [CBUUID] ?? [])
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? ""
        let health = advertised.filter { pairs[$0] != nil }
        // Devices that advertise a health service, plus our own boards by name in case they do not.
        guard !health.isEmpty || name.hasPrefix("GeneSense") else { return }
        let measures = health.compactMap { Self.names[$0.uuidString] }.joined(separator: " · ")
        let rssi = RSSI.intValue == 127 ? -100 : RSSI.intValue
        if let index = found.firstIndex(where: { $0.id == peripheral.identifier }) {
            found[index].rssi = rssi
            if !name.isEmpty { found[index].name = name }
            if !measures.isEmpty { found[index].measures = measures }
        } else {
            found.append(Found(id: peripheral.identifier, peripheral: peripheral, name: name.isEmpty ? "Máy đo" : name,
                               measures: measures.isEmpty ? "Máy đo GeneSense" : measures, rssi: rssi))
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        subscribed = 0
        peripheral.discoverServices(Array(pairs.keys))
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connecting = nil
        failRequest("Chưa kết nối được máy đo. Đặt máy gần điện thoại rồi thử lại.")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        // Only the current device counts; one we let go of ourselves reports here too.
        guard peripheral.identifier == self.peripheral?.identifier else { return }
        self.peripheral = nil
        connecting = nil
        if request != nil { failRequest("Máy đo đã ngắt kết nối. Thử lại.") } else { run("window.gsNative._ble({type: \"disconnected\"})") }
    }
}

extension Bluetooth: @MainActor CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        let services = (peripheral.services ?? []).filter { pairs[$0.uuid] != nil }
        servicesLeft = services.count
        if services.isEmpty { return finishSubscribing(peripheral) }
        for service in services { peripheral.discoverCharacteristics([pairs[service.uuid]!], for: service) }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        for characteristic in service.characteristics ?? [] where characteristic.uuid == pairs[service.uuid] {
            peripheral.setNotifyValue(true, for: characteristic)
            subscribed += 1
        }
        servicesLeft -= 1
        if servicesLeft == 0 { finishSubscribing(peripheral) }
    }

    private func finishSubscribing(_ peripheral: CBPeripheral) {
        guard subscribed > 0 else { return failRequest("Thiết bị không cung cấp dịch vụ BLE y tế chuẩn được hỗ trợ.") }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        succeed(name: peripheral.name ?? found.first { $0.id == peripheral.identifier }?.name ?? "Máy đo")
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, let value = characteristic.value, let service = characteristic.service else { return }
        let event: [String: Any] = ["type": "data", "service": service.uuid.uuidString.lowercased(), "value": value.base64EncodedString()]
        run("window.gsNative._ble(\(Self.json(event)))")
    }
}

/// The device list: a frosted sheet that fills in while scanning.
struct BluetoothPicker: View {
    @ObservedObject var ble: Bluetooth

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Chọn máy đo")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Theme.ink)
            HStack(spacing: 8) {
                if ble.connecting == nil && ble.found.isEmpty { ProgressView().controlSize(.small) }
                Text(hint)
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(ble.found.sorted { $0.rssi > $1.rssi }) { device in row(device) }
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: ble.found.map(\.id))
            Button("Hủy") { ble.picking = false }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.blue)
                .frame(maxWidth: .infinity, minHeight: 48)
                .glass(radius: 14)
        }
        .padding(20)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(.ultraThinMaterial)
        .presentationCornerRadius(28)
    }

    private var hint: String {
        if ble.connecting != nil { return "Đang kết nối…" }
        if !ble.found.isEmpty { return "Chạm vào máy đo để kết nối." }
        return ble.searchedLong ? "Chưa thấy máy đo. Bật máy đo và để gần điện thoại." : "Đang tìm máy đo gần đây…"
    }

    private func row(_ device: Bluetooth.Found) -> some View {
        let active = ble.connecting == device.id
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        return Button { ble.choose(device) } label: {
            HStack(spacing: 12) {
                Image(systemName: "waveform.path.ecg")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.blue)
                    .frame(width: 40, height: 40)
                    .background(Theme.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(device.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.ink)
                    Text(device.measures).font(.footnote).foregroundStyle(Theme.muted)
                }
                Spacer()
                if active {
                    ProgressView()
                } else {
                    // -100 dBm (far) to -50 dBm (close).
                    Image(systemName: "cellularbars", variableValue: min(max(Double(device.rssi + 100) / 50, 0.05), 1))
                        .foregroundStyle(Theme.blue)
                }
            }
            .padding(12)
            .background(.white, in: shape)
            .overlay(shape.strokeBorder(active ? Theme.blue : Color(red: 219 / 255, green: 229 / 255, blue: 241 / 255), lineWidth: active ? 1.5 : 1))
        }
        .buttonStyle(.plain)
        .disabled(ble.connecting != nil && !active)
    }
}

/// Hosts the picker sheet so RootView can observe the Bluetooth model directly.
struct BluetoothSheet: View {
    @ObservedObject var ble: Bluetooth

    var body: some View {
        Color.clear
            .sheet(isPresented: $ble.picking, onDismiss: ble.dismissed) { BluetoothPicker(ble: ble) }
    }
}
