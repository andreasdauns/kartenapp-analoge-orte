// Nahfuchs als „Trusted Web Activity“: die Android-App zeigt https://nahfuchs.de im Vollbild (Chrome-Technik),
// ohne eigenen Code, ohne Werbung, ohne Tracking. Gebaut wird automatisch über GitHub Actions (.github/workflows/android.yml).
plugins {
    id("com.android.application")
}

val versionCodeEnv = (System.getenv("VERSION_CODE") ?: "1").toInt()

android {
    namespace = "de.nahfuchs.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "de.nahfuchs.app"
        minSdk = 24
        targetSdk = 36
        versionCode = versionCodeEnv
        versionName = "1.0.$versionCodeEnv"
    }

    signingConfigs {
        create("upload") {
            // Upload-Schlüssel kommt nur aus GitHub-Secrets (nie im Repo)
            val ks = System.getenv("KEYSTORE_FILE")
            if (ks != null) {
                storeFile = file(ks)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS") ?: "upload"
                keyPassword = System.getenv("KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (System.getenv("KEYSTORE_FILE") != null) signingConfig = signingConfigs.getByName("upload")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
