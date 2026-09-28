ARG ROS_VERSION=lyrical

FROM osrf/ros:${ROS_VERSION}-desktop AS builder

SHELL ["/bin/bash", "-c"]

# Username
ENV user=vizanti

RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    git \
    openssh-client \
    ros-$ROS_DISTRO-rmw-fastrtps-dynamic-cpp \
    ros-$ROS_DISTRO-cyclonedds \
    ros-$ROS_DISTRO-rmw-cyclonedds-cpp \
  && rm -rf /var/lib/apt/lists/*

# Only add our user if it does not exist.
RUN id -u $user &>/dev/null || useradd -ms /bin/bash $user
RUN chown $user: /home
RUN usermod -o -u 1000 -g 1000 $user

USER $user
RUN mkdir -p /home/$user/colcon_ws/src
COPY --chown=$user:$user . /home/$user/colcon_ws/src/vizanti/.

# Install the RWS implementation alternative to ROSbridge.
RUN cd /home/$user/colcon_ws/src/ \
  && git clone -b ${ROS_DISTRO} https://github.com/v-kiniv/rws.git

USER root
RUN rosdep update \
  && apt-get update \
  && cd /home/$user/colcon_ws \
  && rosdep install -i --from-paths src -y \
  && rm -rf /var/lib/apt/lists/*

USER $user
RUN source /opt/ros/${ROS_DISTRO}/setup.bash \
  && cd /home/$user/colcon_ws \
  && colcon build --cmake-args -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DBUILD_TESTING=OFF

# Retain package manifests so the runtime stage can install only runtime ROS
# dependencies without carrying the workspace source tree into the final image.
RUN mkdir -p /tmp/rosdep-src \
  && cd /home/$user/colcon_ws/src \
  && find . -name package.xml -exec cp --parents {} /tmp/rosdep-src \;

FROM ros:${ROS_VERSION}-ros-base

SHELL ["/bin/bash", "-c"]

# Username
ENV user=vizanti

RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    openssh-client \
    ros-$ROS_DISTRO-rmw-fastrtps-dynamic-cpp \
    ros-$ROS_DISTRO-cyclonedds \
    ros-$ROS_DISTRO-rmw-cyclonedds-cpp \
  && rm -rf /var/lib/apt/lists/*

# Only add our user if it does not exist.
RUN id -u $user &>/dev/null || useradd -ms /bin/bash $user
RUN chown $user: /home
RUN usermod -o -u 1000 -g 1000 $user

COPY --from=builder /tmp/rosdep-src /tmp/rosdep-src
RUN rosdep update \
  && apt-get update \
  && rosdep install -i --from-paths /tmp/rosdep-src -y \
  && rm -rf /var/lib/apt/lists/* /root/.ros /tmp/rosdep-src

COPY --from=builder --chown=$user:$user /home/$user/colcon_ws/install /home/$user/colcon_ws/install

USER $user

# Launch Vizanti with RWS or ROSBridge.
CMD source /home/$user/colcon_ws/install/setup.bash \
    && \
    if [ "${USE_RWS}" == "true" ] ; then \
      ros2 launch vizanti_server vizanti_rws.launch.py ; \
    else \
      ros2 launch vizanti_server vizanti_server.launch.py ; \
    fi
