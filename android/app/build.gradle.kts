// NOT a complete build file. Add these lines to the app/build.gradle.kts of an
// Android Studio "Empty Activity" project (Kotlin DSL).

plugins {
    // ...your existing plugins...
    // Reads google-services.json (from the Firebase console) into the app.
    // Also add it to the root build.gradle.kts: id("com.google.gms.google-services") version "4.5.0" apply false
    id("com.google.gms.google-services")
}

android {
    // The code lives in this package. Change it (and the files' `package` line) to yours.
    namespace = "ai.octwin.sample"
}

dependencies {
    // ...your existing dependencies...
    // An "Empty Activity" project already has these two (through its version catalog).
    implementation("androidx.activity:activity-ktx:1.13.0") // registerForActivityResult
    implementation("androidx.core:core-ktx:1.19.1") // notifications, permissions

    implementation("androidx.webkit:webkit:1.17.1") // WebViewCompat.addWebMessageListener

    // Push notifications.
    implementation(platform("com.google.firebase:firebase-bom:35.0.0"))
    implementation("com.google.firebase:firebase-messaging")
}
