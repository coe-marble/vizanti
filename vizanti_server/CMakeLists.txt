cmake_minimum_required(VERSION 3.20)
project(vizanti_server)

if(NOT CMAKE_CXX_STANDARD)
  set(CMAKE_CXX_STANDARD 17)
endif()

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)
find_package(ament_cmake_python REQUIRED)
find_package(ament_cmake_pytest REQUIRED)

find_package(rclcpp REQUIRED)
find_package(rclpy REQUIRED)

find_package(std_msgs REQUIRED)
find_package(std_srvs REQUIRED)
find_package(tf2_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(vizanti_msgs REQUIRED)
find_package(rosbridge_suite REQUIRED)

install(DIRECTORY
  launch
  public
  DESTINATION share/${PROJECT_NAME}
)

install(PROGRAMS
  scripts/__init__.py
  scripts/bt_file_manager.py
  scripts/server.py
  scripts/service_handler.py
  scripts/rqt_reconfigure_param_api.py
  DESTINATION lib/${PROJECT_NAME}
)

ament_add_pytest_test(test_bt_file_manager test/test_bt_file_manager.py)

find_program(VIZANTI_NODE_EXECUTABLE node)
if(VIZANTI_NODE_EXECUTABLE)
  add_test(
    NAME test_vehicle_selection
    COMMAND ${VIZANTI_NODE_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test/test_vehicle_selection.mjs
  )
  add_test(
    NAME test_rosbridge
    COMMAND ${VIZANTI_NODE_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test/test_rosbridge.mjs
  )
  add_test(
    NAME test_util
    COMMAND ${VIZANTI_NODE_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test/test_util.mjs
  )
  add_test(
    NAME test_status
    COMMAND ${VIZANTI_NODE_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test/test_status.mjs
  )
  add_test(
    NAME test_persistent
    COMMAND ${VIZANTI_NODE_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test/test_persistent.mjs
  )
  add_test(
    NAME test_tf
    COMMAND ${VIZANTI_NODE_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test/test_tf.mjs
  )
  file(GLOB VIZANTI_TEMPLATE_TESTS CONFIGURE_DEPENDS
    ${CMAKE_CURRENT_SOURCE_DIR}/test/templates/test_*.mjs
  )
  foreach(template_test IN LISTS VIZANTI_TEMPLATE_TESTS)
    get_filename_component(template_test_name ${template_test} NAME_WE)
    add_test(
      NAME ${template_test_name}
      COMMAND ${VIZANTI_NODE_EXECUTABLE} ${template_test}
    )
  endforeach()
endif()

ament_package()
