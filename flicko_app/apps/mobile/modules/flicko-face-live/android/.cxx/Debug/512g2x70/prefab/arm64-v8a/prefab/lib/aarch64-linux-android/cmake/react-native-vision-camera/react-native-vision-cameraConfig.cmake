if(NOT TARGET react-native-vision-camera::VisionCamera)
add_library(react-native-vision-camera::VisionCamera SHARED IMPORTED)
set_target_properties(react-native-vision-camera::VisionCamera PROPERTIES
    IMPORTED_LOCATION "/run/media/div/Windows/Ubuntu_OS_data/hackathon/Flicko/flicko_app/node_modules/react-native-vision-camera/android/build/intermediates/cxx/Debug/2k5265pe/obj/arm64-v8a/libVisionCamera.so"
    INTERFACE_INCLUDE_DIRECTORIES "/run/media/div/Windows/Ubuntu_OS_data/hackathon/Flicko/flicko_app/node_modules/react-native-vision-camera/android/build/headers/visioncamera"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

