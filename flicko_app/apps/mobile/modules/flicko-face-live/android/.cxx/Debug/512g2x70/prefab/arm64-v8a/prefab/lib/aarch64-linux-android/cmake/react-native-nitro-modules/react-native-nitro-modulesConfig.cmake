if(NOT TARGET react-native-nitro-modules::NitroModules)
add_library(react-native-nitro-modules::NitroModules SHARED IMPORTED)
set_target_properties(react-native-nitro-modules::NitroModules PROPERTIES
    IMPORTED_LOCATION "/run/media/div/Windows/Ubuntu_OS_data/hackathon/Flicko/flicko_app/node_modules/react-native-nitro-modules/android/build/intermediates/cxx/Debug/462a2f4g/obj/arm64-v8a/libNitroModules.so"
    INTERFACE_INCLUDE_DIRECTORIES "/run/media/div/Windows/Ubuntu_OS_data/hackathon/Flicko/flicko_app/node_modules/react-native-nitro-modules/android/build/headers/nitromodules"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

